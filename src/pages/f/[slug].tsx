// Página pública do fluxo: /hot-secret/f/<slug>
import { AI_OFFERS_OUT, flowOffersFrom } from "@/features/chat-engine/engine";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Logo } from "@/components/ui/Logo";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/auth";
import { withBase } from "@/lib/paths";
import { getPublicFunnelById, getPublicFunnelBySlug, resolveExperiment } from "@/services/funnels";
import { activeProviderName, sandboxAllowed } from "@/services/payments";
import { createLiveTransport, createPreviewTransport, type ChatTransport } from "@/features/chat-engine/transport";
import type { ResumeState } from "@/features/chat-engine/useChatEngine";
import { initPixels } from "@/features/chat-engine/pixels";
import { asChatLocale } from "@/features/i18n/chat";
import type { LivePreview, OfferContent, PublicFunnel } from "@/types/flow";

interface Props {
  funnel: PublicFunnel | null;
  sandbox: boolean;
  draftPreview: boolean;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export default function FunnelPage({ funnel, sandbox, draftPreview }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const storageKey = funnel ? `hs_session_${funnel.id}` : "";

  const startSession = useCallback(
    async (restart = false) => {
      if (!funnel || draftPreview) return;
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const k of UTM_KEYS) {
        const v = params.get(k);
        if (v) utm[k] = v;
      }
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(storageKey);
      } catch {
        /* navegação privada */
      }
      try {
        const res = await fetch(withBase("/api/public/session"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            funnelId: funnel.id,
            token: saved,
            restart,
            utm,
            referrer: document.referrer || null,
            landingPage: window.location.href,
            experimentId: funnel.experimentId ?? null,
            variantId: funnel.variantId ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Não foi possível iniciar a conversa");
        try {
          localStorage.setItem(storageKey, data.token);
        } catch {
          /* ignore */
        }
        setResume({ resumed: data.resumed, conversation: data.conversation, messages: data.messages, payments: data.payments });
        setToken(data.token);
        setRound((r) => r + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro de conexão");
      }
    },
    [funnel, draftPreview, storageKey],
  );

  useEffect(() => {
    void startSession(false);
  }, [startSession]);

  // pixels de anúncios (não carregam na pré-visualização de rascunho)
  useEffect(() => {
    if (funnel && !draftPreview)
      initPixels(
        funnel.tracking,
        Object.values(funnel.products)
          .map((p) => p.metaPixelId)
          .filter((v): v is string => !!v),
      );
  }, [funnel, draftPreview]);

  const transport: ChatTransport | null = useMemo(() => {
    if (!funnel) return null;
    if (draftPreview) {
      return createPreviewTransport(funnel.products, (id) => {
        const n = funnel.graph.nodes.find((x) => x.id === id);
        return (n?.content as OfferContent | undefined)?.productId;
      },
      (id) => (funnel.graph.nodes.find((x) => x.id === id)?.content as { url?: string } | undefined)?.url || undefined,
      (id) => funnel.graph.nodes.find((x) => x.id === id)?.content as { brainId?: string; goal?: string; videoId?: string } | undefined,
      (id) => (funnel.graph.edges.some((e) => e.source === id && e.condition === AI_OFFERS_OUT) ? flowOffersFrom(funnel.graph, id) : undefined),
      asChatLocale(funnel.locale),
      // rascunho aberto pelo admin: as prévias do Canal VIP vêm da configuração do fluxo
      async () => {
        const r = await fetch(withBase(`/api/admin/funnels/${funnel.id}`)).catch(() => null);
        const j = r?.ok ? ((await r.json()) as { funnel?: { settings?: { live?: { previews?: LivePreview[] } } } }) : null;
        return (j?.funnel?.settings?.live?.previews ?? []).filter((p) => p.url);
      });
    }
    if (!token) return null;
    return createLiveTransport(() => token, { sandbox, locale: asChatLocale(funnel.locale) });
    // um transporte por rodada de conversa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnel, token, sandbox, draftPreview, round]);

  if (!funnel) {
    return (
      <div className="chat-shell">
        <Head>
          <title>Conversa indisponível · HOT SECRET</title>
        </Head>
        <div className="chat-empty">
          <Logo size={40} />
          <h1>Esta conversa não está disponível</h1>
          <p>O link pode ter expirado ou ainda não foi publicado.</p>
        </div>
      </div>
    );
  }

  const es = asChatLocale(funnel.locale) !== "pt-BR";
  return (
    <>
      <Head>
        <title>{`${funnel.character.name} · HOT SECRET`}</title>
        <meta name="description" content={es ? "Conversaciones que guardan secretos." : "Conversas que guardam segredos."} />
        <meta property="og:title" content={funnel.character.name} />
        <meta property="og:description" content={es ? "Una conversación puede cambiarlo todo." : "Uma conversa pode mudar tudo."} />
        {funnel.character.avatarUrl && <meta property="og:image" content={funnel.character.avatarUrl} />}
        <meta name="robots" content="noindex" />
      </Head>
      {error ? (
        <div className="chat-shell">
          <div className="chat-empty">
            <h1>{es ? "Ups..." : "Ops..."}</h1>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => location.reload()}>
              {es ? "Intentar de nuevo" : "Tentar novamente"}
            </button>
          </div>
        </div>
      ) : (
        <ChatWindow
          key={round}
          funnel={funnel}
          transport={transport}
          resume={resume}
          previewLabel={draftPreview ? "Rascunho · pré-visualização com PIX simulado — publique o fluxo para cobrar de verdade" : undefined}
          onRestart={draftPreview ? () => setRound((r) => r + 1) : () => startSession(true)}
        />
      )}
    </>
  );
}

/** Canal VIP AO VIVO sem cidade fixa: mostra a cidade do lead (localização aproximada da conexão, dada pela Vercel). */
function withLeadCity(funnel: PublicFunnel, header: string | string[] | undefined): PublicFunnel {
  if (!funnel.live || funnel.live.city) return funnel;
  let city = "";
  try {
    city = decodeURIComponent(String(Array.isArray(header) ? header[0] : (header ?? ""))).trim().slice(0, 60);
  } catch {
    city = "";
  }
  return city ? { ...funnel, live: { ...funnel.live, city } } : funnel;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const r = await funnelProps(ctx);
  if ("props" in r && r.props && (r.props as Props).funnel) {
    const p = r.props as Props;
    return { props: { ...p, funnel: withLeadCity(p.funnel!, ctx.req.headers["x-vercel-ip-city"]) } };
  }
  return r;
};

const funnelProps: GetServerSideProps<Props> = async ({ params, req, res }) => {
  const slug = String(params?.slug ?? "").toLowerCase();
  const sandbox = activeProviderName() === "sandbox" && sandboxAllowed();

  // A/B test: slug de experimento distribui entre fluxos (variante fixa por cookie)
  const cookieName = `hs_exp_${slug.replace(/[^a-z0-9-]/g, "")}`;
  const exp = await resolveExperiment(slug, req.cookies[cookieName]);
  if (exp) {
    const funnel = await getPublicFunnelById(exp.variant.funnelId);
    if (funnel) {
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=${exp.variant.id}; Path=${process.env.NEXT_PUBLIC_BASE_PATH || "/"}; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`,
      );
      return { props: { funnel: { ...funnel, experimentId: exp.experimentId, variantId: exp.variant.id }, sandbox, draftPreview: false } };
    }
  }

  let funnel = await getPublicFunnelBySlug(slug);
  let draftPreview = false;
  if (!funnel) {
    // administradores podem abrir rascunhos (modo preview, sem gravar dados)
    const admin = await verifyAdminSession(req.cookies[ADMIN_COOKIE]);
    if (admin) {
      funnel = await getPublicFunnelBySlug(slug, { allowDraft: true, includeLocked: true });
      draftPreview = !!funnel;
    }
  }
  if (!funnel) res.statusCode = 404;
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { funnel, sandbox, draftPreview } };
};
