// "WhatsApp pessoal": contato da modelo com o número borrado → PIX → link da conversa.
// Usado no upsell da chamada (editor de vídeo) e no Combo do Cérebro (WhatsApp, chamada de vídeo e Grupo VIP num PIX só).
// O número nunca chega ao navegador antes do pagamento: o link vem do /api/public/delivery.
import { useEffect, useState } from "react";
import { useChatI18n, type ChatTexts } from "@/features/i18n/chat";
import type { ChatTransport } from "@/features/chat-engine/transport";
import type { OfferContent, PublicCharacter, PublicProduct } from "@/types/flow";
import { withBase } from "@/lib/paths";

export function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.4 8.4 0 1 1 21 11.5z" />
      <circle cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Avatar({ character, badge }: { character: PublicCharacter; badge?: boolean }) {
  return (
    <div className="wau-avatar">
      {character.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.avatarUrl} alt="" />
      ) : (
        <span>{character.name.slice(0, 1)}</span>
      )}
      {badge && (
        <i className="wau-badge">
          <ChatBubbleIcon />
        </i>
      )}
    </div>
  );
}

/** cartão do contato: foto, nome, "online agora" e o número borrado */
export function WhatsAppContact({ character }: { character: PublicCharacter }) {
  const { t } = useChatI18n();
  return (
    <div className="wau-contact">
      <Avatar character={character} badge />
      <div className="wau-who">
        <b>{character.name}</b>
        <small>
          <span className="wau-dot" /> {t.waOnline}
        </small>
        <span className="wau-number" aria-hidden="true">
          +•• •• •••••-••••
        </span>
      </div>
    </div>
  );
}

/** textos da oferta com os padrões do WhatsApp onde o dono deixou em branco */
export function whatsappOffer(
  offer: OfferContent,
  character: PublicCharacter,
  t: ChatTexts,
  own: { title?: string; ctaLabel?: string } = {},
): OfferContent {
  return withDefaults(offer, character, {
    badge: t.waUpsellTag,
    title: own.title || t.waUpsellText,
    intro: t.waIntro,
    benefits: t.waBenefits,
    completeLabel: own.ctaLabel || t.waCta,
    payTitle: t.waPixTitle,
  });
}

/** nomes dos produtos incluídos no combo (os que o chat conhece) */
const comboProductNames = (offer: OfferContent, products: Record<string, PublicProduct>) =>
  (offer.combo?.products ?? []).map((id) => products[id]?.name).filter((n): n is string => !!n);

/** combo do Cérebro: só WhatsApp usa os textos do WhatsApp; com mais itens, os textos do combo com um benefício por item */
export function comboOffer(offer: OfferContent, character: PublicCharacter, t: ChatTexts, products: Record<string, PublicProduct>): OfferContent {
  const c = offer.combo ?? {};
  const names = comboProductNames(offer, products);
  if (c.whatsapp && !c.vip && !offer.videoId && !names.length) return whatsappOffer(offer, character, t, { ctaLabel: offer.ctaLabel });
  return withDefaults(offer, character, {
    badge: t.comboTag,
    title: t.comboTitle,
    intro: t.comboIntro,
    benefits: [c.whatsapp ? t.comboWhatsappBenefit : "", offer.videoId ? t.waCallBenefit : "", c.vip ? t.waVipBenefit : "", ...names].filter(Boolean),
    completeLabel: offer.ctaLabel || t.comboCta,
    payTitle: t.comboPixTitle,
  });
}

function withDefaults(
  offer: OfferContent,
  character: PublicCharacter,
  d: { badge: string; title: string; intro: string; benefits: string[]; completeLabel: string; payTitle: string },
): OfferContent {
  const v = offer.vip ?? {};
  const written = (v.benefits ?? []).map((b) => b.trim()).filter(Boolean);
  return {
    ...offer,
    style: "live",
    vip: {
      ...v,
      badge: v.badge?.trim() || d.badge,
      title: v.title?.trim() || d.title,
      highlight: v.highlight?.trim() || character.name,
      intro: v.intro?.trim() || d.intro,
      benefits: written.length ? written : d.benefits,
      completeLabel: v.completeLabel?.trim() || d.completeLabel,
      payTitle: v.payTitle?.trim() || d.payTitle,
      paySubtitle: v.paySubtitle?.trim() || character.name,
    },
  };
}

type Delivered = Awaited<ReturnType<ChatTransport["delivery"]>>;

/** links depois do pagamento (o servidor pode levar um instante para ver o pagamento aprovado) */
function useDelivered(transport: ChatTransport | null, productId: string, enabled: boolean) {
  const [got, setGot] = useState<Delivered | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !transport) return;
    let alive = true;
    let tries = 0;
    const load = () =>
      transport
        .delivery(productId)
        .then((r) => alive && setGot(r))
        .catch(() => {
          if (!alive) return;
          if (++tries < 4) setTimeout(load, 1500);
          else setGot(null);
        });
    setGot(undefined);
    load();
    return () => {
      alive = false;
    };
  }, [enabled, transport, productId, attempt]);
  return { got, retry: () => setAttempt((a) => a + 1) };
}

/** botões do que foi liberado: WhatsApp, Grupo VIP e o link do produto */
function OpenButtons({ got, retry }: { got: Delivered | null | undefined; retry: () => void }) {
  const { t } = useChatI18n();
  if (got === null)
    return (
      <button className="vip-copy vipu-open wau-open" onClick={retry}>
        {t.waRetry}
      </button>
    );
  if (!got) return <div className="vip-sheet-sub wau-loading">{t.waLoading}</div>;
  // upsell do editor de vídeo: o link do WhatsApp vem em url
  const wa = got.whatsapp ?? (got.vipUrl || got.accessUrl || got.items?.length ? undefined : (got.url ?? undefined));
  return (
    <>
      {wa && (
        <a className="vip-copy vipu-open wau-open" href={wa} target="_blank" rel="noopener">
          <ChatBubbleIcon /> {t.waOpen}
        </a>
      )}
      {got.vipUrl && (
        <a className={`vip-copy vipu-open ${wa ? "wau-extra" : "wau-vip"}`} href={withBase(got.vipUrl)} target="_blank" rel="noopener">
          {t.waOpenVip}
        </a>
      )}
      {got.accessUrl && (
        <a className="vip-copy vipu-open wau-extra" href={withBase(got.accessUrl)} target="_blank" rel="noopener">
          {t.waOpenAccess}
        </a>
      )}
      {(got.items ?? []).map((i, k) =>
        i.url ? (
          <a key={k} className="vip-copy vipu-open wau-extra" href={withBase(i.url)} target="_blank" rel="noopener">
            {t.comboOpenItem} {i.name} →
          </a>
        ) : (
          <div key={k} className="combo-done">
            ✓ {i.name}
          </div>
        ),
      )}
    </>
  );
}

/** pagou: "liberado" com os botões (WhatsApp, Grupo VIP, link do produto) */
export function WhatsAppDoneSheet({
  character,
  transport,
  productId,
  title,
  backLabel,
  onClose,
}: {
  character: PublicCharacter;
  transport: ChatTransport | null;
  productId: string;
  title?: string;
  backLabel: string;
  onClose: () => void;
}) {
  const { t } = useChatI18n();
  const { got, retry } = useDelivered(transport, productId, true);
  return (
    <div className="vip-sheet vipu-done-sheet wau-done" role="dialog" aria-label={title || t.waUnlocked}>
      <Avatar character={character} />
      <div className="vip-sheet-title">{title || t.waUnlocked}</div>
      <div className="vip-sheet-sub">{character.name}</div>
      <OpenButtons got={got} retry={retry} />
      <button className="vipu-back" onClick={onClose}>
        {backLabel}
      </button>
    </div>
  );
}

/** combo do Cérebro no chat: o contato (com WhatsApp) e os itens; depois de pago, os botões do que foi liberado */
export function ComboOfferCard({
  offer,
  product,
  products,
  character,
  transport,
  bought,
  onOpen,
}: {
  offer: OfferContent;
  product: PublicProduct | undefined;
  /** produtos do fluxo (nomes dos incluídos no combo) */
  products: Record<string, PublicProduct>;
  character: PublicCharacter;
  transport: ChatTransport | null;
  bought: boolean;
  onOpen: () => void;
}) {
  const { t, money } = useChatI18n();
  const { got, retry } = useDelivered(transport, offer.productId, bought);
  if (!product) return <div className="bubble system">{t.offerUnavailable}</div>;
  const c = offer.combo ?? {};
  const items = [
    c.whatsapp ? t.comboWhatsappItem : "",
    offer.videoId ? t.comboCallItem : "",
    c.vip ? t.comboVipItem : "",
    ...comboProductNames(offer, products).map((n) => `📦 ${n}`),
  ].filter(Boolean);
  const hasLinks = !!(got && (got.whatsapp || got.vipUrl || got.accessUrl || got.items?.length));
  return (
    <div className="msg-row bot">
      <div className="vip-card wau-card">
        {c.whatsapp ? (
          <WhatsAppContact character={character} />
        ) : (
          <div className="combo-head">
            <Avatar character={character} />
            <b>{offer.vip?.title?.trim() || t.comboTitle}</b>
          </div>
        )}
        {items.length > 1 && (
          <div className="combo-items">
            {items.map((i) => (
              <span key={i}>{i}</span>
            ))}
          </div>
        )}
        {bought ? (
          got && !hasLinks ? (
            <div className="combo-done">{t.comboDone}</div>
          ) : (
            <OpenButtons got={got} retry={retry} />
          )
        ) : (
          <>
            <div className="vip-card-price">{money(product.price, product.currency)}</div>
            <button className="vip-ticket main wau-cta" onClick={onOpen}>
              {offer.ctaLabel || offer.vip?.completeLabel || (items.length > 1 || !c.whatsapp ? t.comboCta : t.waCta)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
