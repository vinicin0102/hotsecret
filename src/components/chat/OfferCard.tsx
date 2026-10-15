import { useChatI18n } from "@/features/i18n/chat";
import type { OfferContent, PublicProduct } from "@/types/flow";
import { VideoMessage } from "./MediaMessages";

export function OfferCard({
  offer,
  product,
  onCta,
  onVideoPlay,
  disabled,
}: {
  offer: OfferContent;
  product: PublicProduct | undefined;
  onCta: () => void;
  onVideoPlay?: () => void;
  disabled?: boolean;
}) {
  const { t, money } = useChatI18n();
  if (!product) {
    return <div className="bubble system">{t.offerUnavailable}</div>;
  }
  const description = offer.description || product.description;
  const original = product.originalPrice && product.originalPrice > product.price ? product.originalPrice : null;
  const pct = original ? Math.round((1 - product.price / original) * 100) : 0;
  return (
    <div className="msg-row bot">
      <div className="card-msg offer-card">
        <div className="offer-media">
          {product.videoUrl ? (
            <div className="card-video">
              <VideoMessage url={product.videoUrl} thumbnailUrl={product.imageUrl ?? undefined} onPlay={onVideoPlay} />
            </div>
          ) : product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="card-img" src={product.imageUrl} alt={product.name} />
          ) : (
            <div className="card-img offer-placeholder" aria-hidden="true">
              <span>🔒</span>
            </div>
          )}
          <span className="offer-seal">🔒 {t.exclusive}</span>
        </div>
        <div className="card-body offer-body">
          <h3 className="offer-title">{offer.headline || product.name}</h3>
          {description && <p>{description}</p>}
          <div className="offer-price-row">
            <div className="offer-price">
              {original ? (
                <span className="price-old">
                  {t.from} {money(original, product.currency)}
                </span>
              ) : null}
              <span className="price">
                {money(product.price, product.currency)} <small>{t.oneTime}</small>
              </span>
            </div>
            {pct >= 5 && <span className="offer-off">{t.offPct.replace("{n}", String(pct))}</span>}
          </div>
          <button className="btn btn-primary cta-glow offer-cta" onClick={onCta} disabled={disabled}>
            <span>{offer.ctaLabel || t.wantAccess}</span>
            <span className="offer-cta-arrow" aria-hidden="true">
              →
            </span>
          </button>
          <div className="secure-note">{t.securePix}</div>
        </div>
      </div>
    </div>
  );
}
