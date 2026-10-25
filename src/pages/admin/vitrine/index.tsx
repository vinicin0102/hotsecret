// Vitrine: carrossel de modelos — o lead escolhe com qual quer conversar e cai no chat dela. O editor fica em /admin/vitrine/[id].
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Modal } from "@/components/ui/Modal";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { withBase } from "@/lib/paths";
import { slugify } from "@/lib/format";

interface ShowcaseRow {
  id: string;
  name: string;
  slug: string;
  published: boolean;
  itemCount: number;
}

export default function ShowcasesPage() {
  const router = useRouter();
  const { data, reload } = useFetch<{ showcases: ShowcaseRow[] }>("/api/admin/showcases");
  const [creating, setCreating] = useState<{ name: string; slug: string; touched: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const create = async () => {
    if (!creating) return;
    setError(null);
    try {
      const r = await api<{ showcase: { id: string } }>("/api/admin/showcases", {
        body: { name: creating.name, slug: creating.slug, published: false, items: [] },
      });
      void router.push(`/admin/vitrine/${r.showcase.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar");
    }
  };
  const remove = async (s: ShowcaseRow) => {
    if (!confirm(`Excluir a vitrine ${s.name}? Os fluxos das modelos não são apagados.`)) return;
    await api(`/api/admin/showcases/${s.id}`, { method: "DELETE" });
    void reload();
  };
  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}${withBase(`/v/${slug}`)}`).catch(() => undefined);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <AdminLayout
      title="Vitrine"
      subtitle="Carrossel de modelos: o lead vê a foto, a bio e o que cada uma faz, escolhe com quem quer conversar e cai no chat dela"
      actions={
        <button className="btn btn-primary" onClick={() => setCreating({ name: "", slug: "", touched: false })}>
          + Nova vitrine
        </button>
      }
    >
      <div className="entity-grid">
        {data?.showcases.map((s) => (
          <div key={s.id} className="card entity-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="serif" style={{ fontSize: 19 }}>
                {s.name}
              </div>
              <span className={`pill ${s.published ? "pill-on" : ""}`}>{s.published ? "Publicada" : "Rascunho"}</span>
            </div>
            <div className="hint">
              /v/{s.slug} · {s.itemCount} modelo(s)
            </div>
            <div className="row">
              <Link className="btn btn-sm btn-primary" href={`/admin/vitrine/${s.id}`}>
                Editar
              </Link>
              <a className="btn btn-sm" href={withBase(`/v/${s.slug}`)} target="_blank" rel="noreferrer">
                Ver página ↗
              </a>
              <button className="btn btn-sm" onClick={() => void copy(s.slug)}>
                {copied === s.slug ? "Copiado ✓" : "Copiar link"}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(s)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
        {data?.showcases.length === 0 && (
          <div className="card empty">
            Crie a primeira vitrine: adicione as modelos (cada uma com o fluxo dela), escreva a bio e o que ela faz e escolha se o chat abre no estilo
            Secret ou WhatsApp.
          </div>
        )}
      </div>

      {creating && (
        <Modal title="Nova vitrine" onClose={() => setCreating(null)}>
          <div className="field">
            <label htmlFor="sc-name">Nome</label>
            <input
              id="sc-name"
              className="input"
              placeholder="Ex.: Modelos BR"
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value, slug: creating.touched ? creating.slug : slugify(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="sc-slug">Link</label>
            <input
              id="sc-slug"
              className="input"
              placeholder="modelos-br"
              value={creating.slug}
              onChange={(e) => setCreating({ ...creating, slug: slugify(e.target.value), touched: true })}
            />
            <span className="hint">O lead acessa em /v/{creating.slug || "link"}</span>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setCreating(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void create()} disabled={!creating.name.trim() || creating.slug.length < 2}>
              Criar vitrine
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
