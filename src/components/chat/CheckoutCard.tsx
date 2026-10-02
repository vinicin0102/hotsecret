import { useState } from "react";
import { formatBRL } from "@/lib/format";
import type { PublicProduct } from "@/types/flow";
import type { CheckoutForm } from "@/features/chat-engine/transport";

/** Confirmação da compra: sem formulário — um toque gera a chave PIX. */
export function CheckoutCard({ product, onSubmit }: { product: PublicProduct; onSubmit: (form: CheckoutForm) => Promise<unknown> }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ method: "PIX" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o PIX. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="msg-row bot">
      <div className="card-msg checkout-card">
        <div className="card-body">
          <div className="eyebrow">Finalizar acesso</div>
          <div className="summary">
            <div>
              <div className="hint">Produto</div>
              <div className="pname">{product.name}</div>
            </div>
            <div className="pprice">{formatBRL(product.price)}</div>
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 13 }}>
            Pagamento via <b style={{ color: "#fff" }}>PIX</b> · liberação imediata aqui no chat
          </p>
          {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
          <button className="btn btn-primary cta-glow" onClick={confirm} disabled={loading}>
            {loading ? "Gerando PIX..." : `GERAR PIX · ${formatBRL(product.price)}`}
          </button>
          <div className="secure-note">
            Você está comprando <b>{product.name}</b> por <b>{formatBRL(product.price)}</b>.
            <br />O conteúdo é liberado aqui mesmo assim que o pagamento for confirmado.
          </div>
        </div>
      </div>
    </div>
  );
}
