import { useState, type FormEvent } from "react";
import { isValidCpf, maskCpf } from "@/lib/cpf";
import { formatBRL } from "@/lib/format";
import type { PublicProduct } from "@/types/flow";
import type { CheckoutForm } from "@/features/chat-engine/transport";

export function CheckoutCard({
  product,
  onSubmit,
  defaults,
}: {
  product: PublicProduct;
  onSubmit: (form: CheckoutForm) => Promise<unknown>;
  defaults?: Partial<CheckoutForm>;
}) {
  const [form, setForm] = useState<CheckoutForm>({
    name: defaults?.name ?? "",
    email: defaults?.email ?? "",
    cpf: defaults?.cpf ?? "",
    method: "PIX",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.name.trim().split(/\s+/).length < 2) return setError("Informe seu nome completo.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError("Informe um e-mail válido.");
    if (!isValidCpf(form.cpf)) return setError("CPF inválido.");
    setLoading(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível finalizar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="msg-row bot">
      <form className="card-msg checkout-card" onSubmit={submit} noValidate>
        <div className="card-body">
          <div className="eyebrow">Finalizar acesso</div>
          <div className="summary">
            <div>
              <div className="hint">Produto</div>
              <div className="pname">{product.name}</div>
            </div>
            <div className="pprice">{formatBRL(product.price)}</div>
          </div>
          <div className="field">
            <label htmlFor="co-name">Nome</label>
            <input id="co-name" className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="co-email">E-mail</label>
            <input id="co-email" className="input" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="co-cpf">CPF</label>
            <input id="co-cpf" className="input" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} placeholder="000.000.000-00" />
          </div>
          <div className="label" style={{ marginBottom: 6 }}>Pagamento</div>
          <div className="pay-methods">
            {(["PIX", "CARD"] as const).map((m) => (
              <label key={m} className={`pay-method ${form.method === m ? "active" : ""}`}>
                <input type="radio" name="method" checked={form.method === m} onChange={() => setForm({ ...form, method: m })} />
                {m === "PIX" ? "PIX" : "Cartão"}
              </label>
            ))}
          </div>
          {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
          <button className="btn btn-primary cta-glow" type="submit" disabled={loading}>
            {loading ? "Gerando pagamento..." : `FINALIZAR PAGAMENTO · ${formatBRL(product.price)}`}
          </button>
          <div className="secure-note">
            Ao continuar você realiza a compra de <b>{product.name}</b> por <b>{formatBRL(product.price)}</b>.
            <br />O acesso é liberado somente após a confirmação do pagamento.
          </div>
        </div>
      </form>
    </div>
  );
}
