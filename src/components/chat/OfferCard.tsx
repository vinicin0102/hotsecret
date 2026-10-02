import { formatBRL } from "@/lib/format";
import type { OfferContent, PublicProduct } from "@/types/flow";

export function OfferCard({
  offer,
  product,
  onCta,
  disabled,
}: {
  offer: OfferContent;
  product: PublicProduct | undefined;
  onCta: () => void;
  disabled?: boolean;
}) {
  if (!product) {
    return <div className="bubble system">Oferta indisponível no momento.</div>;
  }
  return (
    <div className="msg-row bot">
      <div className="card-msg">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="card-img" src={product.imageUrl} alt={product.name} />
        ) : (
          <div className="card-img" />
        )}
        <div className="card-body">
          <div className="eyebrow">Oferta exclusiva</div>
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
