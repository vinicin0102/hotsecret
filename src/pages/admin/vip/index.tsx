// Grupo VIP: os grupos das modelas (perfil com fotos/vídeos; conteúdo VIP libera pagando). O editor fica em /admin/vip/[id].
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Modal } from "@/components/ui/Modal";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { withBase } from "@/lib/paths";
import { slugify } from "@/lib/format";

interface GroupRow {
  id: string;
  name: string;
  slug: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  published: boolean;
  postCount: number;
  /** pessoas com o VIP liberado (compraram) */
  memberCount: number;
  locale: string;
}
interface CharacterRow {
  id: string;
  name: string;
  avatarUrl: string | null;
}

const FLAG: Record<string, string> = { "pt-BR": "🇧🇷", "es-MX": "🇲🇽", "es-AR": "🇦🇷" };

export default function VipGroupsPage() {
  const router = useRouter();
  const { data, reload } = useFetch<{ groups: GroupRow[] }>("/api/admin/vip");
  const { data: chars } = useFetch<{ characters: CharacterRow[] }>("/api/admin/characters");
  const [creating, setCreating] = useState<{ name: string; slug: string; characterId: string; touched: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const create = async () => {
    if (!creating) return;
    setError(null);
    try {
      const r = await api<{ group: { id: string } }>("/api/admin/vip", {
        body: { name: creating.name, slug: creating.slug, characterId: creating.characterId || null, published: false },
      });
      void router.push(`/admin/vip/${r.group.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar");
    }
  };
  const remove = async (g: GroupRow) => {
    if (!confirm(`Excluir o grupo ${g.name}? Os ${g.postCount} post(s) também serão apagados.`)) return;
    await api(`/api/admin/vip/${g.id}`, { method: "DELETE" });
    void reload();
  };
  const link = (slug: string) => `${window.location.origin}${withBase(`/g/${slug}`)}`;
  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(link(slug)).catch(() => undefined);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <AdminLayout
      title="Grupo VIP"
      subtitle="O perfil VIP de cada modelo: fotos e vídeos grátis, só para assinantes ou pagos à parte — o lead libera pagando"
      actions={
        <button className="btn btn-primary" onClick={() => setCreating({ name: "", slug: "", characterId: "", touched: false })}>
          + Novo grupo
        </button>
      }
    >
      <div className="entity-grid">
        {data?.groups.map((g) => (
          <div key={g.id} className="card entity-card vip-row">
            <div className="vip-row-cover" style={g.coverUrl ? { backgroundImage: `url(${g.coverUrl})` } : undefined}>
              {g.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.avatarUrl} alt="" />
              )}
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="serif" style={{ fontSize: 19 }}>
                {FLAG[g.locale] ?? ""} {g.name}
              </div>
              <span className={`pill ${g.published ? "pill-on" : ""}`}>{g.published ? "Publicado" : "Rascunho"}</span>
            </div>
            <div className="vip-row-members" title="Pessoas com o VIP liberado (compraram)">
              <b>{g.memberCount.toLocaleString("pt-BR")}</b> {g.memberCount === 1 ? "pessoa já entrou" : "pessoas já entraram"}
            </div>
            <div className="hint">
              /g/{g.slug} · {g.postCount} post(s)
            </div>
            <div className="row">
              <Link className="btn btn-sm btn-primary" href={`/admin/vip/${g.id}`}>
                Editar
              </Link>
              <a className="btn btn-sm" href={withBase(`/g/${g.slug}`)} target="_blank" rel="noreferrer">
                Ver página ↗
              </a>
              <button className="btn btn-sm" onClick={() => void copy(g.slug)}>
                {copied === g.slug ? "Copiado ✓" : "Copiar link"}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(g)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
        {data?.groups.length === 0 && (
          <div className="card empty">
            Crie o primeiro Grupo VIP: escolha a modelo, envie as fotos e vídeos e defina o que é grátis, o que é só para assinantes e o que é pago à
            parte.
          </div>
        )}
      </div>

      {creating && (
        <Modal title="Novo Grupo VIP" onClose={() => setCreating(null)}>
          <div className="field">
            <label htmlFor="vg-model">Modelo</label>
            <select
              id="vg-model"
              className="select"
              value={creating.characterId}
              onChange={(e) => {
                const c = chars?.characters.find((x) => x.id === e.target.value);
                const name = creating.name || c?.name || "";
                setCreating({ ...creating, characterId: e.target.value, name, slug: creating.touched ? creating.slug : slugify(name) });
              }}
            >
              <option value="">— escolha (nome e foto do perfil) —</option>
              {chars?.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="vg-name">Nome do grupo</label>
            <input
              id="vg-name"
              className="input"
              placeholder="VIP da Bianca"
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value, slug: creating.touched ? creating.slug : slugify(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="vg-slug">Link</label>
            <div className="row" style={{ gap: 6 }}>
              <span className="hint">/g/</span>
              <input
                id="vg-slug"
                className="input"
                placeholder="bianca"
                value={creating.slug}
                onChange={(e) => setCreating({ ...creating, slug: slugify(e.target.value), touched: true })}
              />
            </div>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setCreating(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={() => void create()} disabled={!creating.name.trim() || creating.slug.length < 2}>
              Criar e editar
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
