import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UploadInput } from "@/components/admin/UploadInput";
import { Avatar } from "@/components/chat/ChatHeader";
import { Modal } from "@/components/ui/Modal";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";

interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  status: string;
  showOnline: boolean;
  initialMessages: string[];
  _count?: { funnels: number };
}

const EMPTY: Omit<Character, "id"> = { name: "", avatarUrl: "", description: "", status: "online", showOnline: true, initialMessages: [] };

export default function Characters() {
  const { data, reload } = useFetch<{ characters: Character[] }>("/api/admin/characters");
  const [editing, setEditing] = useState<(Omit<Character, "id"> & { id?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!editing) return;
    setError(null);
    const body = {
      name: editing.name,
      avatarUrl: editing.avatarUrl || null,
      description: editing.description || null,
      status: editing.status || "online",
      showOnline: editing.showOnline,
      initialMessages: editing.initialMessages.filter((m) => m.trim()),
    };
    try {
      if (editing.id) await api(`/api/admin/characters/${editing.id}`, { method: "PUT", body });
      else await api("/api/admin/characters", { body });
      setEditing(null);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };
  const remove = async (c: Character) => {
    if (!confirm(`Excluir ${c.name}?`)) return;
    await api(`/api/admin/characters/${c.id}`, { method: "DELETE" });
    void reload();
  };

  return (
    <AdminLayout
      title="Personagens"
      subtitle="Quem conversa com o visitante"
      actions={
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>
          + Novo personagem
        </button>
      }
    >
      <div className="entity-grid">
        {data?.characters.map((c) => (
          <div key={c.id} className="card entity-card">
            <div className="char-head">
              <Avatar character={{ ...c, avatarUrl: c.avatarUrl }} size={60} />
              <div>
                <div className="serif" style={{ fontSize: 19 }}>
                  {c.name}
                </div>
                <div className="hint row" style={{ gap: 6 }}>
                  {c.showOnline && <span className="dot" />} {c.status}
                </div>
              </div>
            </div>
            {c.description && <div className="muted">{c.description}</div>}
            {c.initialMessages.length > 0 && <div className="hint">“{c.initialMessages[0]}”</div>}
            <div className="hint">{c._count?.funnels ?? 0} fluxo(s)</div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setEditing({ ...c, avatarUrl: c.avatarUrl ?? "", description: c.description ?? "" })}>
                Editar
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(c)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
        {data?.characters.length === 0 && <div className="card empty">Crie o primeiro personagem (ex.: Dra. Júlia).</div>}
      </div>

      {editing && (
        <Modal title={editing.id ? "Editar personagem" : "Novo personagem"} onClose={() => setEditing(null)}>
          <div className="field">
            <label>Nome</label>
            <input className="input" placeholder="Dra. Júlia" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Foto</label>
            <UploadInput value={editing.avatarUrl ?? ""} onChange={(avatarUrl) => setEditing({ ...editing, avatarUrl })} />
          </div>
          <div className="field">
            <label>Descrição</label>
            <input
              className="input"
              placeholder="Especialista em relacionamentos"
              value={editing.description ?? ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Status</label>
              <input className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} />
            </div>
            <div className="field">
              <label>Indicador online</label>
              <label className="checkbox" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={editing.showOnline} onChange={(e) => setEditing({ ...editing, showOnline: e.target.checked })} />
                Mostrar bolinha verde
              </label>
            </div>
          </div>
          <div className="field">
            <label>Mensagens iniciais (uma por linha)</label>
            <textarea
              className="textarea"
              value={editing.initialMessages.join("\n")}
              onChange={(e) => setEditing({ ...editing, initialMessages: e.target.value.split("\n") })}
            />
            <span className="hint">Sugeridas como mensagem inicial ao criar um fluxo com este personagem.</span>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!editing.name}>
              Salvar
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
