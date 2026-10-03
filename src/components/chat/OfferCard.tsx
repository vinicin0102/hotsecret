import { formatBRL } from "@/lib/format";
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
  if (!product) {
    return <div className="bubble system">Oferta indisponível no momento.</div>;
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
            <div className="price-old">De {formatBRL(product.originalPrice)}</div>
          ) : null}
          <div className="price">
            {formatBRL(product.price)} <small>pagamento único</small>
          </div>
          <button className="btn btn-primary cta-glow" onClick={onCta} disabled={disabled}>
            {offer.ctaLabel || "QUERO ACESSAR ❤️"}
          </button>
          <div className="secure-note">🔒 Compra segura via PIX · sem cadastro</div>
        </div>
      </div>
    </div>
  );
}
