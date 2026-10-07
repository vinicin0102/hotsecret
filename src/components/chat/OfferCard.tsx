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
  return (
    <div className="msg-row bot">
      <div className="card-msg">
        {product.videoUrl ? (
          <div className="card-video">
            <VideoMessage url={product.videoUrl} thumbnailUrl={product.imageUrl ?? undefined} onPlay={onVideoPlay} />
          </div>
        ) : product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="card-img" src={product.imageUrl} alt={product.name} />
        ) : (
          <div className="card-img" />
        )}
        <div className="card-body">
          <h3>{offer.headline || product.name}</h3>
          {(offer.description || product.description) && <p>{offer.description || product.description}</p>}
          {product.originalPrice && product.originalPrice > product.price ? (
            <div className="price-old">
              {t.from} {money(product.originalPrice, product.currency)}
            </div>
          ) : null}
          <div className="price">
            {money(product.price, product.currency)} <small>{t.oneTime}</small>
          </div>
          <button className="btn btn-primary cta-glow" onClick={onCta} disabled={disabled}>
            {offer.ctaLabel || t.wantAccess}
          </button>
          <div className="secure-note">{t.securePix}</div>
        </div>
      </div>
    </div>
  );
}
