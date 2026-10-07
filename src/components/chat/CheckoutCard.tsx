import { useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { PublicProduct } from "@/types/flow";
import type { CheckoutForm } from "@/features/chat-engine/transport";

/** Confirmação da compra: sem formulário — um toque gera a chave PIX. */
export function CheckoutCard({ product, onSubmit }: { product: PublicProduct; onSubmit: (form: CheckoutForm) => Promise<unknown> }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t, money } = useChatI18n();
  const price = money(product.price, product.currency);

  const confirm = async () => {
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ method: "PIX" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t.generateError);
      setLoading(false);
    }
  };

  return (
    <div className="msg-row bot">
      <div className="card-msg checkout-card">
        <div className="card-body">
          <div className="eyebrow">{t.finishAccess}</div>
          <div className="summary">
            <div>
              <div className="hint">{t.product}</div>
              <div className="pname">{product.name}</div>
            </div>
            <div className="pprice">{price}</div>
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 13 }}>
            {t.payVia} <b style={{ color: "#fff" }}>{t.payMethod}</b> · {t.instantRelease}
          </p>
          {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
          <button className="btn btn-primary cta-glow" onClick={confirm} disabled={loading}>
            {loading ? t.generating : `${t.generate} · ${price}`}
          </button>
          <div className="secure-note">
            {t.buyingA} <b>{product.name}</b> {t.buyingFor} <b>{price}</b>.
            <br />
            {t.buyingB}
          </div>
        </div>
      </div>
    </div>
  );
}
