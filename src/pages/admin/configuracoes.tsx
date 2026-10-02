import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { TagChip } from "@/components/admin/Badges";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";

interface Tag {
  id: string;
  name: string;
  color: string;
  _count: { leads: number };
}
interface Automation {
  id: string;
  name: string;
  trigger: string;
  funnelId: string | null;
  action: "add_tag" | "remove_tag";
  tagId: string | null;
  active: boolean;
}
interface Settings {
  provider: string;
  sandbox: boolean;
  webhookUrl: string;
  cronUrl: string;
  configured: Record<string, boolean>;
}
interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
}

const TRIGGERS = [
  ["chat_started", "Iniciou conversa"],
  ["button_clicked", "Clicou em botão"],
  ["question_answered", "Respondeu pergunta"],
  ["offer_viewed", "Viu oferta"],
  ["checkout_started", "Iniciou checkout"],
  ["payment_pending", "Pagamento pendente"],
  ["payment_approved", "Pagamento aprovado"],
  ["payment_failed", "Pagamento recusado"],
  ["payment_refunded", "Pagamento estornado"],
  ["checkout_recovery_sent", "Recuperação enviada"],
  ["chat_completed", "Concluiu conversa"],
];

const CONFIG_LABEL: Record<string, string> = {
  authSecret: "AUTH_SECRET (sessões)",
  mercadopagoToken: "MERCADOPAGO_ACCESS_TOKEN",
  mercadopagoWebhookSecret: "MERCADOPAGO_WEBHOOK_SECRET",
  cronSecret: "CRON_SECRET",
  blobStorage: "BLOB_READ_WRITE_TOKEN (uploads)",
};

export default function SettingsPage() {
  const { data: tags, reload: reloadTags } = useFetch<{ tags: Tag[] }>("/api/admin/tags");
  const { data: autos, reload: reloadAutos } = useFetch<{ automations: Automation[] }>("/api/admin/automations");
  const { data: funnels } = useFetch<{ funnels: { id: string; name: string }[] }>("/api/admin/funnels");
  const { data: settings } = useFetch<Settings>("/api/admin/settings");
  const { data: users, reload: reloadUsers, error: usersError } = useFetch<{ users: User[] }>("/api/admin/users");

  const [tagForm, setTagForm] = useState({ name: "", color: "#D94F7D" });
  const [autoForm, setAutoForm] = useState({ name: "", trigger: "payment_approved", funnelId: "", action: "add_tag", tagId: "" });
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "", role: "ADMIN" });
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };

  const tagName = (id: string | null) => tags?.tags.find((t) => t.id === id)?.name ?? "—";

  return (
    <AdminLayout title="Configurações" subtitle="Tags, automações, integrações e equipe">
      {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="settings-grid">
        <div className="card">
          <h3>Tags</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="input" placeholder="NOVA TAG" value={tagForm.name} onChange={(e) => setTagForm({ ...tagForm, name: e.target.value.toUpperCase() })} />
            <input type="color" value={tagForm.color} onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })} style={{ width: 44, height: 40, border: 0, background: "none" }} />
            <button
              className="btn btn-primary btn-sm"
              disabled={!tagForm.name}
              onClick={() =>
                run(async () => {
                  await api("/api/admin/tags", { body: tagForm });
                  setTagForm({ name: "", color: "#D94F7D" });
                  void reloadTags();
                })
              }
            >
              Criar
            </button>
          </div>
          <div className="inline-list">
            {tags?.tags.map((t) => (
              <div key={t.id} className="inline-item" style={{ justifyContent: "space-between" }}>
                <TagChip name={t.name} color={t.color} />
                <span className="hint">{t._count.leads} lead(s)</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    confirm(`Excluir a tag ${t.name}?`) &&
                    run(async () => {
                      await api(`/api/admin/tags/${t.id}`, { method: "DELETE" });
                      void reloadTags();
                    })
                  }
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
          <p className="hint">Tags automáticas do sistema: COMPROU (pagamento aprovado) e ABANDONO (recuperação enviada).</p>
        </div>

        <div className="card">
          <h3>Automações</h3>
          <div className="grid-2">
            <div className="field">
              <label>Quando</label>
              <select className="select" value={autoForm.trigger} onChange={(e) => setAutoForm({ ...autoForm, trigger: e.target.value })}>
                {TRIGGERS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>No fluxo</label>
              <select className="select" value={autoForm.funnelId} onChange={(e) => setAutoForm({ ...autoForm, funnelId: e.target.value })}>
                <option value="">Qualquer fluxo</option>
                {funnels?.funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Ação</label>
              <select className="select" value={autoForm.action} onChange={(e) => setAutoForm({ ...autoForm, action: e.target.value })}>
                <option value="add_tag">Adicionar tag</option>
                <option value="remove_tag">Remover tag</option>
              </select>
            </div>
            <div className="field">
              <label>Tag</label>
              <select className="select" value={autoForm.tagId} onChange={(e) => setAutoForm({ ...autoForm, tagId: e.target.value })}>
                <option value="">Selecione...</option>
                {tags?.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={!autoForm.tagId}
            onClick={() =>
              run(async () => {
                const trig = TRIGGERS.find(([k]) => k === autoForm.trigger)?.[1] ?? autoForm.trigger;
                await api("/api/admin/automations", {
                  body: { ...autoForm, funnelId: autoForm.funnelId || null, name: `${trig} → ${tagName(autoForm.tagId)}`, active: true },
                });
                void reloadAutos();
              })
            }
          >
            Criar automação
          </button>
          <div className="inline-list" style={{ marginTop: 14 }}>
            {autos?.automations.map((a) => (
              <div key={a.id} className="inline-item">
                <span style={{ flex: 1 }}>
                  <b>{TRIGGERS.find(([k]) => k === a.trigger)?.[1] ?? a.trigger}</b> → {a.action === "add_tag" ? "adicionar" : "remover"} <b>{tagName(a.tagId)}</b>
                  <span className="hint"> · {a.funnelId ? funnels?.funnels.find((f) => f.id === a.funnelId)?.name : "todos os fluxos"}</span>
                </span>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={a.active}
                    onChange={() =>
                      run(async () => {
                        await api(`/api/admin/automations/${a.id}`, {
                          method: "PUT",
                          body: { name: a.name, trigger: a.trigger, funnelId: a.funnelId, action: a.action, tagId: a.tagId, active: !a.active },
                        });
                        void reloadAutos();
                      })
                    }
                  />
                  ativa
                </label>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    run(async () => {
                      await api(`/api/admin/automations/${a.id}`, { method: "DELETE" });
                      void reloadAutos();
                    })
                  }
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Pagamentos e integrações</h3>
          {settings && (
            <>
              <dl className="kv">
                <dt>Gateway</dt>
                <dd>
                  <b>{settings.provider}</b> {settings.sandbox && <span className="pill status-DRAFT">teste</span>}
                </dd>
                <dt>Webhook</dt>
                <dd>
                  <code className="inline">{settings.webhookUrl}</code>
                </dd>
                <dt>Cron</dt>
                <dd>
                  <code className="inline">{settings.cronUrl}</code>
                </dd>
              </dl>
              <div className="section-title">Variáveis de ambiente (servidor)</div>
              {Object.entries(settings.configured).map(([k, ok]) => (
                <div key={k} className="hint" style={{ margin: "4px 0" }}>
                  <span className={ok ? "check-ok" : "check-no"}>{ok ? "✓" : "✕"}</span> {CONFIG_LABEL[k] ?? k}
                </div>
              ))}
              <p className="hint">Chaves secretas ficam apenas no servidor (.env) e nunca são enviadas ao navegador.</p>
            </>
          )}
        </div>

        <div className="card">
          <h3>Equipe</h3>
          {usersError ? (
            <p className="hint">Apenas o proprietário (OWNER) gerencia a equipe.</p>
          ) : (
            <>
              <div className="inline-list" style={{ marginBottom: 14 }}>
                {users?.users.map((u) => (
                  <div key={u.id} className="inline-item">
                    <span style={{ flex: 1 }}>
                      <b>{u.name}</b> <span className="hint">{u.email}</span>
                      <div className="hint">Último acesso: {formatDateTime(u.lastLoginAt)}</div>
                    </span>
                    <span className="pill">{u.role}</span>
                    {u.role !== "OWNER" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          run(async () => {
                            await api(`/api/admin/users?id=${u.id}`, { method: "DELETE" });
                            void reloadUsers();
                          })
                        }
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid-2">
                <input className="input" placeholder="Nome" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                <input className="input" placeholder="E-mail" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                <input className="input" type="password" placeholder="Senha (mín. 8)" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                <select className="select" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                  <option value="ADMIN">Admin (edita)</option>
                  <option value="VIEWER">Leitura</option>
                </select>
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ marginTop: 10 }}
                onClick={() =>
                  run(async () => {
                    await api("/api/admin/users", { body: userForm });
                    setUserForm({ name: "", email: "", password: "", role: "ADMIN" });
                    void reloadUsers();
                  })
                }
              >
                Adicionar membro
              </button>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
