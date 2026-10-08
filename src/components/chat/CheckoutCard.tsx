import { useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { PublicProduct } from "@/types/flow";
import type { CheckoutForm, PayMethod, PayerData } from "@/features/chat-engine/transport";
import { PayerForm } from "./PayerForm";

/**
 * Confirmação da compra: no PIX, um toque gera a chave. Gateways que pedem dados do comprador
 * (Zenith: México/Argentina) mostram antes o formulário com os campos do catálogo.
 */
export function CheckoutCard({
  product,
  onSubmit,
  loadMethods,
  initialPayer,
}: {
  product: PublicProduct;
  onSubmit: (form: CheckoutForm) => Promise<unknown>;
  loadMethods?: () => Promise<PayMethod[] | null>;
  initialPayer?: PayerData | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [noForm, setNoForm] = useState(false);
  const withForm = !!product.payerForm && !!loadMethods && !noForm;
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
            {/* com o formulário do gateway o método é escolhido logo abaixo (SPEI, OXXO...) */}
            {withForm ? t.securePayment : <>{t.payVia} <b style={{ color: "#fff" }}>{t.payMethod}</b></>} · {t.instantRelease}
          </p>
          {withForm ? (
            <PayerForm
              loadMethods={loadMethods!}
              initial={initialPayer}
              submitLabel={`${t.generate} · ${price}`}
              busyLabel={t.generating}
              onSubmit={(payer) => onSubmit({ method: "PIX", payer })}
              onNoForm={() => setNoForm(true)}
            />
          ) : (
            <>
              {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
              <button className="btn btn-primary cta-glow" onClick={confirm} disabled={loading}>
                {loading ? t.generating : `${t.generate} · ${price}`}
              </button>
            </>
          )}
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
