import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Modal } from "@/components/ui/Modal";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatNumber, slugify } from "@/lib/format";
import { withBase } from "@/lib/paths";

interface FunnelRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  character: { name: string; avatarUrl: string | null } | null;
  stats: { visitors: number; sales: number; conversion: number };
  updatedAt: string;
}
interface CharacterRow {
  id: string;
  name: string;
  initialMessages: string[];
}

const STATUS_LABEL = { DRAFT: "Rascunho", PUBLISHED: "Publicado", ARCHIVED: "Arquivado" };

export default function Funnels() {
  const router = useRouter();
  const { data, reload } = useFetch<{ funnels: FunnelRow[] }>("/api/admin/funnels");
  const { data: chars } = useFetch<{ characters: CharacterRow[] }>("/api/admin/characters");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", slug: "", characterId: "", initialMessage: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const create = async () => {
    setError(null);
    try {
      const r = await api<{ funnel: { id: string } }>("/api/admin/funnels", {
        body: {
          name: form.name,
          description: form.description || null,
          slug: form.slug,
          characterId: form.characterId || null,
          initialMessage: form.initialMessage || null,
        },
      });
      void router.push(`/admin/fluxos/${r.funnel.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };

  const duplicate = async (id: string) => {
    await api(`/api/admin/funnels/${id}/duplicate`, { method: "POST", body: {} });
    void reload();
  };
  const remove = async (f: FunnelRow) => {
    if (!confirm(`Excluir o fluxo "${f.name}"? Leads e pagamentos são mantidos.`)) return;
    await api(`/api/admin/funnels/${f.id}`, { method: "DELETE" });
    void reload();
  };

  return (
    <AdminLayout
      title="Fluxos"
      subtitle="Cada fluxo é uma conversa com URL própria"
      actions={
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Criar novo fluxo
        </button>
      }
    >
      {data && data.funnels.length === 0 && (
        <div className="card empty">
          <p>Nenhum fluxo ainda. Crie o primeiro e monte a conversa visualmente.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + Criar novo fluxo
          </button>
        </div>
      )}
      <div className="funnel-grid">
        {data?.funnels.map((f) => (
          <div key={f.id} className="card funnel-card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="title">{f.name}</div>
                <div className="url">
                  {origin}
                  {withBase(`/f/${f.slug}`)}
                </div>
              </div>
              <span className={`pill status-${f.status}`}>{STATUS_LABEL[f.status]}</span>
            </div>
            {f.character && <div className="hint">Personagem: {f.character.name}</div>}
            <div className="metrics">
              <div>
                <b>{formatNumber(f.stats.visitors)}</b>
                <span>visitantes</span>
              </div>
              <div>
                <b>{formatNumber(f.stats.sales)}</b>
                <span>vendas</span>
              </div>
              <div>
                <b>{(f.stats.conversion * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b>
                <span>conversão</span>
              </div>
            </div>
            <div className="actions">
              <Link className="btn btn-primary btn-sm" href={`/admin/fluxos/${f.id}`}>
                Editar
              </Link>
              <Link className="btn btn-sm" href={`/admin/fluxos/${f.id}/analytics`}>
                Analytics
              </Link>
              <a className="btn btn-sm" href={withBase(`/f/${f.slug}`)} target="_blank" rel="noreferrer">
                Abrir
              </a>
              <button className="btn btn-sm" onClick={() => duplicate(f.id)}>
                Duplicar
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(f)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <Modal title="Criar fluxo" onClose={() => setCreating(false)}>
          <div className="field">
            <label>Nome do fluxo</label>
            <input
              className="input"
              placeholder="Segredo do Relacionamento"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
              }}
            />
          </div>
          <div className="field">
            <label>Descrição</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>URL personalizada</label>
            <div className="row">
              <span className="dim" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                {withBase("/f/")}
              </span>
              <input
                className="input"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm({ ...form, slug: slugify(e.target.value) });
                }}
              />
            </div>
          </div>
          <div className="field">
            <label>Personagem</label>
            <select
              className="select"
              value={form.characterId}
              onChange={(e) => {
                const ch = chars?.characters.find((c) => c.id === e.target.value);
                setForm((f) => ({ ...f, characterId: e.target.value, initialMessage: f.initialMessage || ch?.initialMessages?.[0] || "" }));
              }}
            >
              <option value="">— selecione —</option>
              {chars?.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="hint">
              Crie personagens (nome, foto, status) em <Link href="/admin/personagens">Personagens</Link>.
            </span>
          </div>
          <div className="field">
            <label>Mensagem inicial</label>
            <textarea
              className="textarea"
              placeholder="Oi... posso te fazer uma pergunta que talvez você não esperava? 👀"
              value={form.initialMessage}
              onChange={(e) => setForm({ ...form, initialMessage: e.target.value })}
            />
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={!form.name || form.slug.length < 2} onClick={create}>
              Criar e abrir editor
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
