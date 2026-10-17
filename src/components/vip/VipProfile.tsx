// Página pública do Grupo VIP: perfil da modelo, card da assinatura, feed e grade de mídias.
// Post bloqueado chega do servidor só com a prévia borrada; tocar nele abre a folha do pagamento (PIX/SPEI)
// e, aprovado, a página recarrega com o conteúdo liberado.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import { vipTexts, type VipTexts } from "@/features/i18n/vip";
import { ApiError, type PayMethods, type PayerData, type PublicPaymentInfo } from "@/features/chat-engine/transport";
import { PixPayBody } from "@/components/chat/VideoCall";
import { withBase } from "@/lib/paths";
import type { VipState as ServerState } from "@/services/vip";

/** o que a página recebe do servidor (pagamentos no formato do chat) */
type VipState = Omit<ServerState, "payments"> & { payments: PublicPaymentInfo[] };
type Post = VipState["posts"][number];
type Product = NonNullable<VipState["group"]["product"]>;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withBase(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Sem conexão. Tente de novo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Erro", data as Record<string, unknown>);
  return data as T;
}

export function VipProfile({ slug, sandbox }: { slug: string; sandbox: boolean }) {
  const { locale, money } = useChatI18n();
  const t = vipTexts(locale);
  const [state, setState] = useState<VipState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const token = useRef<string | null>(null);
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [buying, setBuying] = useState<Product | null>(null);
  const [viewer, setViewer] = useState<{ items: { kind: string; url: string }[]; index: number } | null>(null);
  const key = `hs_vip_${slug}`;
  /** card da assinatura na tela: a barra de baixo só aparece depois que ele sai (sem dois botões iguais) */
  const subRef = useRef<HTMLElement | null>(null);
  const [subVisible, setSubVisible] = useState(true);
  const watchSub = useCallback((el: HTMLElement | null) => {
    subRef.current = el;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSubVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) if (params.get(k)) utm[k] = params.get(k)!;
    const acesso = params.get("acesso");
    if (acesso) {
      // o acesso vindo do chat não fica na barra de endereço (nem é compartilhado sem querer)
      params.delete("acesso");
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    }
    if (!token.current) {
      try {
        token.current = localStorage.getItem(key);
      } catch {
        /* navegação privada */
      }
    }
    try {
      const r = await post<VipState & { token: string }>(`/api/public/vip/${slug}`, {
        token: token.current,
        acesso,
        utm,
        referrer: document.referrer || null,
        landingPage: window.location.href,
      });
      token.current = r.token;
      try {
        localStorage.setItem(key, r.token);
      } catch {
        /* ignore */
      }
      setState(r);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [key, slug]);

  useEffect(() => void load(), [load]);

  // pagamento em andamento: confere a cada 4s (só com a página visível)
  const pending = state?.payments.some((p) => p.status === "PENDING" || p.status === "CREATED");
  useEffect(() => {
    if (!pending) return;
    const iv = setInterval(() => !document.hidden && void load(), 4000);
    return () => clearInterval(iv);
  }, [pending, load]);

  if (!state) {
    return (
      <div className="vg-page vg-loading" onClick={() => loadError && void load()}>
        {loadError ? t.error : <span className="once-spin" aria-label={t.loading} />}
      </div>
    );
  }

  const g = state.group;
  const sub = g.product;
  const offerSub = !!sub && !state.subscribed;
  const buyFor = (p: Post) => (p.access === "paid" ? p.product : p.access === "vip" ? sub : null);
  const media = state.posts.flatMap((p) => p.media.map((m, i) => ({ ...m, post: p, i })));

  return (
    <div className={`vg-page ${offerSub ? "with-bar" : ""}`}>
      {!g.published && <div className="vg-draft">{t.draft}</div>}
      <header className="vg-head">
        <div className="vg-cover" style={g.coverUrl ? { backgroundImage: `url(${g.coverUrl})` } : undefined} />
        <div className="vg-id">
          <div className="vg-avatar">
            {g.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.avatarUrl} alt="" />
            ) : (
              <span>{g.name.slice(0, 1)}</span>
            )}
          </div>
          <h1 className="vg-name">
            {g.name}
            <span className="vg-verified" title={t.verified} aria-label={t.verified}>
              ✓
            </span>
          </h1>
          <div className="vg-handle">@{g.slug}</div>
          <div className="vg-stats">
            <span>
              <b>{g.counts.posts}</b> {t.posts}
            </span>
            <span>
              <b>{g.counts.images}</b> {t.photos}
            </span>
            <span>
              <b>{g.counts.videos}</b> {t.videos}
            </span>
          </div>
          {g.bio && <Bio text={g.bio} t={t} />}
        </div>
      </header>

      {state.subscribed && <div className="vg-is-vip">{t.youAreVip}</div>}
      {offerSub && (
        <section className="vg-sub" ref={watchSub}>
          <div className="vg-sub-head">{g.settings.headline || t.headline}</div>
          {!!g.settings.perks?.length && (
            <>
              <div className="vg-sub-perks-title">{t.perksTitle}</div>
              <ul className="vg-sub-perks">
                {g.settings.perks.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
          <div className="vg-sub-price">
            {sub.originalPrice && sub.originalPrice > sub.price ? <s>{money(sub.originalPrice, sub.currency)}</s> : null}
            <b>{money(sub.price, sub.currency)}</b>
            <small>{t.once}</small>
          </div>
          <button className="vg-cta" onClick={() => setBuying(sub)}>
            {g.settings.ctaLabel || t.subscribe} <span aria-hidden="true">→</span>
          </button>
          <div className="vg-secure">{t.secure}</div>
        </section>
      )}

      <nav className="vg-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "posts"} className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}>
          {t.tabPosts}
        </button>
        <button role="tab" aria-selected={tab === "media"} className={tab === "media" ? "active" : ""} onClick={() => setTab("media")}>
          {t.tabMedia}
        </button>
      </nav>

      {state.posts.length === 0 && <p className="vg-empty">{t.empty}</p>}

      {tab === "posts" ? (
        <div className="vg-feed">
          {state.posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              group={g}
              t={t}
              buy={buyFor(p)}
              onBuy={(pr) => setBuying(pr)}
              onOpen={(index) => setViewer({ items: p.media.filter((m) => m.url).map((m) => ({ kind: m.kind, url: m.url! })), index })}
            />
          ))}
        </div>
      ) : (
        <div className="vg-grid">
          {media.map((m) => {
            const pr = m.post.locked ? buyFor(m.post) : null;
            return (
              <button
                key={`${m.post.id}-${m.i}`}
                className={`vg-cell ${m.url ? "" : "locked"}`}
                onClick={() => {
                  if (m.url) setViewer({ items: m.post.media.filter((x) => x.url).map((x) => ({ kind: x.kind, url: x.url! })), index: m.i });
                  else if (pr) setBuying(pr);
                }}
              >
                {m.url ? (
                  m.kind === "video" ? (
                    <video src={`${m.url}#t=0.5`} muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" loading="lazy" />
                  )
                ) : m.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="vg-blur" src={m.preview} alt="" loading="lazy" />
                ) : (
                  <span className="vg-blur vg-blur-empty" />
                )}
                {m.kind === "video" && <span className="vg-cell-kind">▶</span>}
                {!m.url && <span className="vg-cell-lock">🔒</span>}
              </button>
            );
          })}
        </div>
      )}

      {offerSub && !buying && !subVisible && (
        <div className="vg-bar">
          <button className="vg-cta" onClick={() => setBuying(sub)}>
            {g.settings.ctaLabel || t.subscribe} · {money(sub.price, sub.currency)}
          </button>
        </div>
      )}

      {buying && (
        <PaySheet
          slug={slug}
          token={token.current ?? ""}
          product={buying}
          model={g.model}
          t={t}
          payments={state.payments}
          sandbox={sandbox}
          bought={!!state && isOwned(state, buying.id)}
          onPayment={(p) => setState((s) => (s ? { ...s, payments: [p, ...s.payments.filter((x) => x.id !== p.id)] } : s))}
          onRefresh={load}
          onClose={() => setBuying(null)}
        />
      )}

      {viewer && <Viewer items={viewer.items} start={viewer.index} t={t} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** o lead já tem este produto liberado (pagamento aprovado) */
function isOwned(state: VipState, productId: string) {
  return state.payments.some((p) => p.productId === productId && p.status === "APPROVED");
}

function Bio({ text, t }: { text: string; t: VipTexts }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 140;
  return (
    <p className="vg-bio">
      {long && !open ? `${text.slice(0, 140).trimEnd()}… ` : `${text} `}
      {long && (
        <button className="vg-more-btn" onClick={() => setOpen(!open)}>
          {open ? t.less : t.more}
        </button>
      )}
    </p>
  );
}

function timeAgo(iso: string, locale: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), "minute");
  if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

function PostCard({
  post,
  group,
  t,
  buy,
  onBuy,
  onOpen,
}: {
  post: Post;
  group: VipState["group"];
  t: VipTexts;
  buy: Product | null;
  onBuy: (p: Product) => void;
  onOpen: (index: number) => void;
}) {
  const { locale, money } = useChatI18n();
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const many = post.media.length > 1;
  const onScroll = () => {
    const el = scroller.current;
    if (el) setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const counts = [post.counts.images ? `📷 ${post.counts.images}` : "", post.counts.videos ? `🎬 ${post.counts.videos}` : ""].filter(Boolean).join(" · ");
  return (
    <article className="vg-post">
      <div className="vg-post-head">
        {group.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.avatarUrl} alt="" />
        ) : (
          <span className="vg-post-ini">{group.name.slice(0, 1)}</span>
        )}
        <div>
          <b>{group.name}</b>
          <small>
            {timeAgo(post.publishedAt, locale)}
            {post.pinned ? ` · 📌 ${t.pinned}` : ""}
          </small>
        </div>
        {post.access !== "free" && <span className={`vg-badge ${post.access}`}>{post.access === "vip" ? "💎 VIP" : "💰"}</span>}
      </div>
      {post.caption && <p className="vg-post-text">{post.caption}</p>}
      {post.media.length > 0 &&
        (post.locked ? (
          <button className="vg-locked" onClick={() => buy && onBuy(buy)} disabled={!buy}>
            {post.media[0].preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="vg-blur" src={post.media[0].preview} alt="" />
            ) : (
              <span className="vg-blur vg-blur-empty" />
            )}
            <span className="vg-locked-inner">
              <span className="vg-lock-ico">🔒</span>
              <b>{post.access === "paid" ? t.paidContent : t.vipContent}</b>
              {counts && <small>{counts}</small>}
              {buy && (
                <span className="vg-locked-cta">
                  {(post.access === "paid" ? t.unlockFor : t.subscribeToSee).replace("{p}", money(buy.price, buy.currency))}
                </span>
              )}
            </span>
          </button>
        ) : (
          <div className="vg-media-wrap">
            <div className="vg-media-track" ref={scroller} onScroll={many ? onScroll : undefined}>
              {post.media.map((m, i) =>
                m.kind === "video" ? (
                  <video
                    key={i}
                    src={m.url!}
                    poster={undefined}
                    controls
                    playsInline
                    preload="metadata"
                    controlsList="nodownload noremoteplayback"
                    disablePictureInPicture
                    onContextMenu={(e) => e.preventDefault()}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={m.url!} alt="" loading="lazy" onClick={() => onOpen(i)} onContextMenu={(e) => e.preventDefault()} />
                ),
              )}
            </div>
            {many && (
              <>
                <span className="vg-media-count">
                  {idx + 1}/{post.media.length}
                </span>
                <div className="vg-dots" aria-hidden="true">
                  {post.media.map((_, i) => (
                    <span key={i} className={i === idx ? "on" : ""} />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
    </article>
  );
}

/** folha do pagamento: gera o PIX (ou pede os dados que o gateway exige) e acompanha até liberar */
function PaySheet({
  slug,
  token,
  product,
  model,
  t,
  payments,
  sandbox,
  bought,
  onPayment,
  onRefresh,
  onClose,
}: {
  slug: string;
  token: string;
  product: Product;
  model: string;
  t: VipTexts;
  payments: PublicPaymentInfo[];
  sandbox: boolean;
  bought: boolean;
  onPayment: (p: PublicPaymentInfo) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const { money } = useChatI18n();
  const [needPayer, setNeedPayer] = useState(!!product.payerForm);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  // pagamento deste produto: o mais recente (aprovado/pendente/recusado)
  const latest = useMemo(() => payments.find((p) => p.productId === product.id), [payments, product.id]);
  const payment = latest && latest.status !== "FAILED" ? latest : undefined;
  const failed = latest?.status === "FAILED";

  const checkout = useCallback(
    async (payer?: PayerData) => {
      setError(null);
      try {
        const r = await post<{ payment: PublicPaymentInfo }>(`/api/public/vip/${slug}/checkout`, { token, productId: product.id, ...(payer ? { payer } : {}) });
        onPayment(r.payment);
        setNeedPayer(false);
      } catch (e) {
        if (e instanceof ApiError && (e.data.code === "payer_required" || e.data.code === "invalid_fields" || e.data.code === "method_required")) {
          setNeedPayer(true);
          if (payer) throw e; // o formulário marca os campos recusados
          return;
        }
        if (payer) throw e;
        setError(e instanceof Error ? e.message : "Erro");
      }
    },
    [slug, token, product.id, onPayment],
  );

  // abre e já gera (como o PIX do chat), a menos que precise dos dados do comprador
  useEffect(() => {
    if (started.current || bought || payment || product.payerForm) return;
    started.current = true;
    void checkout();
  }, [bought, payment, product.payerForm, checkout]);

  // aprovado: mostra "Liberado ✓" e fecha
  useEffect(() => {
    if (!bought) return;
    const id = setTimeout(onClose, 1600);
    return () => clearTimeout(id);
  }, [bought, onClose]);

  const simulate = sandbox
    ? async (paymentId: string, status: "APPROVED" | "FAILED") => {
        await post(`/api/public/vip/${slug}/sandbox`, { token, paymentId, status }).catch(() => undefined);
        await onRefresh();
      }
    : undefined;

  return (
    <div className="vg-sheet-wrap" role="dialog" aria-label={t.payTitle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vg-sheet">
        <button className="vg-sheet-x" onClick={onClose} aria-label={t.close}>
          ✕
        </button>
        <div className="vg-sheet-title">🔓 {product.name}</div>
        <div className="vg-sheet-price">
          {product.originalPrice && product.originalPrice > product.price ? <s>{money(product.originalPrice, product.currency)}</s> : null}{" "}
          <b>{money(product.price, product.currency)}</b>
        </div>
        {bought ? (
          <div className="vg-sheet-ok">{t.unlocked}</div>
        ) : (
          <PixPayBody
            character={{ name: model, avatarUrl: null, description: null, status: "", showOnline: false }}
            payment={failed ? latest : payment && (payment.status === "PENDING" || payment.status === "CREATED") ? payment : undefined}
            error={error}
            doneStep={t.doneStep}
            payerForm={
              needPayer && !payment
                ? {
                    loadMethods: () => post<PayMethods | { methods: null }>(`/api/public/vip/${slug}/methods`, { token, productId: product.id }).then((r) => (r.methods ? (r as PayMethods) : null)),
                    initial: null,
                    onSubmit: (payer) => checkout(payer),
                  }
                : undefined
            }
            onSimulate={simulate}
          />
        )}
        {failed && !bought && (
          <button className="vg-cta" style={{ marginTop: 12 }} onClick={() => void checkout()}>
            {t.retry}
          </button>
        )}
      </div>
    </div>
  );
}

/** foto/vídeo em tela cheia, com anterior/próximo */
function Viewer({ items, start, t, onClose }: { items: { kind: string; url: string }[]; start: number; t: VipTexts; onClose: () => void }) {
  const [i, setI] = useState(Math.min(start, items.length - 1));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(items.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);
  const m = items[i];
  if (!m) return null;
  return (
    <div className="vg-viewer" role="dialog" aria-label={t.tabMedia} onContextMenu={(e) => e.preventDefault()}>
      <button className="vg-viewer-x" onClick={onClose} aria-label={t.close}>
        ✕
      </button>
      {m.kind === "video" ? (
        <video key={m.url} src={m.url} controls autoPlay playsInline controlsList="nodownload noremoteplayback" disablePictureInPicture />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={m.url} src={m.url} alt="" />
      )}
      {i > 0 && (
        <button className="vg-viewer-nav prev" onClick={() => setI(i - 1)} aria-label="‹">
          ‹
        </button>
      )}
      {i < items.length - 1 && (
        <button className="vg-viewer-nav next" onClick={() => setI(i + 1)} aria-label="›">
          ›
        </button>
      )}
      <span className="vg-viewer-count">
        {i + 1}/{items.length}
      </span>
    </div>
  );
}
