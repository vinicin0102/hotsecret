// Página pública do fluxo: /hot-secret/f/<slug>
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
import type { OfferContent, PublicFunnel } from "@/types/flow";

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

  const transport: ChatTransport | null = useMemo(() => {
    if (!funnel) return null;
    if (draftPreview) {
      return createPreviewTransport(funnel.products, (id) => {
        const n = funnel.graph.nodes.find((x) => x.id === id);
        return (n?.content as OfferContent | undefined)?.productId;
      });
    }
    if (!token) return null;
    return createLiveTransport(() => token, { sandbox });
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

  return (
    <>
      <Head>
        <title>{`${funnel.character.name} · HOT SECRET`}</title>
        <meta name="description" content="Conversas que guardam segredos." />
        <meta property="og:title" content={funnel.character.name} />
        <meta property="og:description" content="Uma conversa pode mudar tudo." />
        {funnel.character.avatarUrl && <meta property="og:image" content={funnel.character.avatarUrl} />}
        <meta name="robots" content="noindex" />
      </Head>
      {error ? (
        <div className="chat-shell">
          <div className="chat-empty">
            <h1>Ops...</h1>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        <ChatWindow
          key={round}
          funnel={funnel}
          transport={transport}
          resume={resume}
          previewLabel={draftPreview ? "Rascunho · pré-visualização (nada é salvo)" : undefined}
          onRestart={draftPreview ? () => setRound((r) => r + 1) : () => startSession(true)}
        />
      )}
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, req, res }) => {
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
      funnel = await getPublicFunnelBySlug(slug, { allowDraft: true });
      draftPreview = !!funnel;
    }
  }
  if (!funnel) res.statusCode = 404;
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { funnel, sandbox, draftPreview } };
};
