import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UploadInput } from "@/components/admin/UploadInput";
import { Modal } from "@/components/ui/Modal";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { centsToInput, formatBRL, parseMoneyToCents } from "@/lib/format";

interface Product {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  originalPrice: number | null;
  price: number;
  checkoutUrl: string | null;
  deliveryUrl: string | null;
  active: boolean;
  stats: { sales: number; revenue: number };
}

type Form = { id?: string; name: string; description: string; imageUrl: string; videoUrl: string; originalPrice: string; price: string; checkoutUrl: string; deliveryUrl: string; active: boolean };
const EMPTY: Form = { name: "", description: "", imageUrl: "", videoUrl: "", originalPrice: "", price: "", checkoutUrl: "", deliveryUrl: "", active: true };

export default function Products() {
  const { data, reload } = useFetch<{ products: Product[] }>("/api/admin/products");
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!form) return;
    setError(null);
    const body = {
      name: form.name,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      videoUrl: form.videoUrl || null,
      originalPrice: form.originalPrice ? parseMoneyToCents(form.originalPrice) : null,
      price: parseMoneyToCents(form.price),
      checkoutUrl: form.checkoutUrl || null,
      deliveryUrl: form.deliveryUrl || null,
      active: form.active,
    };
    try {
      if (form.id) await api(`/api/admin/products/${form.id}`, { method: "PUT", body });
      else await api("/api/admin/products", { body });
      setForm(null);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };
  const remove = async (p: Product) => {
    if (!confirm(`Excluir ${p.name}?`)) return;
    try {
      await api(`/api/admin/products/${p.id}`, { method: "DELETE" });
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <AdminLayout
      title="Produtos"
      subtitle="Produtos vendidos nas ofertas dentro do chat"
      actions={
        <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}>
          + Novo produto
        </button>
      }
    >
      <div className="entity-grid">
        {data?.products.map((p) => (
          <div key={p.id} className="card entity-card">
            {p.videoUrl ? (
              <video className="thumb" src={p.videoUrl} poster={p.imageUrl || undefined} muted playsInline preload="metadata" />
            ) : p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" src={p.imageUrl} alt={p.name} />
            ) : (
              <div className="thumb" />
            )}
            {p.videoUrl && <div className="hint">▶ Com vídeo de prévia</div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="serif" style={{ fontSize: 19 }}>
                {p.name}
              </div>
              <span className={`pill ${p.active ? "status-PUBLISHED" : "status-ARCHIVED"}`}>{p.active ? "Ativo" : "Inativo"}</span>
            </div>
            <div>
              {p.originalPrice ? <span className="price-old">De {formatBRL(p.originalPrice)}</span> : null}
              <div className="serif" style={{ fontSize: 24, fontWeight: 700 }}>
                Por {formatBRL(p.price)}
              </div>
            </div>
            <div className="hint">
              {p.stats.sales} venda(s) · <span className="gold">{formatBRL(p.stats.revenue)}</span>
            </div>
            <div className="hint">{p.deliveryUrl ? "✓ Link de acesso externo" : "Entrega no próprio chat"}</div>
            <div className="row">
              <button
                className="btn btn-sm"
                onClick={() =>
                  setForm({
                    id: p.id,
                    name: p.name,
                    description: p.description ?? "",
                    imageUrl: p.imageUrl ?? "",
                    videoUrl: p.videoUrl ?? "",
                    originalPrice: centsToInput(p.originalPrice),
                    price: centsToInput(p.price),
                    checkoutUrl: p.checkoutUrl ?? "",
                    deliveryUrl: p.deliveryUrl ?? "",
                    active: p.active,
                  })
                }
              >
                Editar
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(p)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
        {data?.products.length === 0 && <div className="card empty">Cadastre o primeiro produto (ex.: Guia Hot Secret).</div>}
      </div>

      {form && (
        <Modal title={form.id ? "Editar produto" : "Novo produto"} onClose={() => setForm(null)}>
          <div className="field">
            <label>Nome</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Descrição</label>
            <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>Imagem</label>
            <UploadInput value={form.imageUrl} onChange={(imageUrl) => setForm((f) => (f ? { ...f, imageUrl } : f))} />
          </div>
          <div className="field">
            <label>Vídeo de prévia (opcional)</label>
            <UploadInput value={form.videoUrl} onChange={(videoUrl) => setForm((f) => (f ? { ...f, videoUrl } : f))} accept="video/mp4,video/webm" />
            <div className="hint">Aparece no card da oferta no lugar da imagem, só com o botão de play. A imagem vira a capa do vídeo.</div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Preço original (R$)</label>
              <input className="input" inputMode="decimal" placeholder="27,00" value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: e.target.value })} />
            </div>
            <div className="field">
              <label>Preço promocional (R$)</label>
              <input className="input" inputMode="decimal" placeholder="9,90" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Link de acesso externo (opcional)</label>
            <input className="input" placeholder="https://..." value={form.deliveryUrl} onChange={(e) => setForm({ ...form, deliveryUrl: e.target.value })} />
            <span className="hint">Deixe vazio se o conteúdo é entregue no próprio chat (blocos depois de “Pagamento aprovado”). Se preenchido, só é revelado após o pagamento aprovado.</span>
          </div>
          <div className="field">
            <label>Checkout externo (opcional)</label>
            <input className="input" placeholder="Deixe vazio para usar o checkout integrado no chat" value={form.checkoutUrl} onChange={(e) => setForm({ ...form, checkoutUrl: e.target.value })} />
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Produto ativo
          </label>
          {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!form.name || !form.price}>
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
