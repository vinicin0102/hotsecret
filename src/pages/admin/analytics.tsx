import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AnalyticsCard } from "@/components/admin/AnalyticsCard";
import { CampaignTable, type CampaignRow } from "@/components/admin/CampaignTable";
import { FunnelSteps, type Step } from "@/components/admin/FunnelSteps";
import { RangeFilter, rangeQuery, type RangeValue } from "@/components/admin/RangeFilter";
import { Modal } from "@/components/ui/Modal";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatBRL, slugify } from "@/lib/format";
import { withBase } from "@/lib/paths";

interface Overview {
  steps: Step[];
  revenue: { amount: number; count: number };
  campaigns: CampaignRow[];
}
interface Experiment {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  report: {
    variantId: string;
    label: string;
    weight: number;
    funnelName: string;
    visitors: number;
    chatStarted: number;
    checkouts: number;
    sales: number;
    revenue: number;
    conversion: number;
    ctr: number;
  }[];
}

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default function Analytics() {
  const [range, setRange] = useState<RangeValue>({ range: "30d" });
  const [funnelId, setFunnelId] = useState("");
  const { data: funnels } = useFetch<{ funnels: { id: string; name: string }[] }>("/api/admin/funnels");
  const { data } = useFetch<Overview>(`/api/admin/analytics/overview?${rangeQuery(range)}&funnelId=${funnelId}`);
  const { data: exps, reload: reloadExps } = useFetch<{ experiments: Experiment[] }>("/api/admin/experiments");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", variants: [{ funnelId: "", label: "A", weight: 50 }, { funnelId: "", label: "B", weight: 50 }] });
  const [error, setError] = useState<string | null>(null);

  const createExp = async () => {
    setError(null);
    try {
      await api("/api/admin/experiments", { body: { ...form, active: true } });
      setCreating(false);
      void reloadExps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  };
  const toggleExp = async (e: Experiment) => {
    await api(`/api/admin/experiments/${e.id}`, { method: "PATCH", body: { active: !e.active } });
    void reloadExps();
  };
  const deleteExp = async (e: Experiment) => {
    if (!confirm(`Excluir o teste ${e.name}?`)) return;
    await api(`/api/admin/experiments/${e.id}`, { method: "DELETE" });
    void reloadExps();
  };

  return (
    <AdminLayout
      title="Analytics"
      subtitle="Funil, campanhas e testes A/B"
      actions={
        <>
          <select className="select" style={{ width: 200 }} value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
            <option value="">Todos os fluxos</option>
            {funnels?.funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <RangeFilter value={range} onChange={setRange} />
        </>
      }
    >
      <div className="stats-grid">
        <AnalyticsCard label="Vendas" value={String(data?.revenue.count ?? 0)} />
        <AnalyticsCard label="Faturamento" value={formatBRL(data?.revenue.amount ?? 0)} gold />
        <AnalyticsCard label="Ticket médio" value={formatBRL(data?.revenue.count ? Math.round(data.revenue.amount / data.revenue.count) : 0)} />
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Funil de conversão</h3>
        {data && <FunnelSteps steps={data.steps} />}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Vendas por campanha (UTM)</h3>
        <CampaignTable rows={data?.campaigns ?? []} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Testes A/B</h3>
          <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
            + Novo teste
          </button>
        </div>
        <p className="hint" style={{ marginTop: -6 }}>
          Um teste usa sua própria URL e distribui os visitantes entre fluxos publicados conforme o peso. Cada visitante fica sempre na mesma variante.
        </p>
        {exps?.experiments.length === 0 && <div className="empty">Nenhum teste criado.</div>}
        {exps?.experiments.map((e) => (
          <div key={e.id} style={{ marginBottom: 18 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" }}>
              <div>
                <b className="serif" style={{ fontSize: 17 }}>
                  {e.name}
                </b>{" "}
                <code className="inline">{withBase(`/f/${e.slug}`)}</code>
              </div>
              <div className="row">
                <span className={`pill ${e.active ? "status-PUBLISHED" : "status-ARCHIVED"}`}>{e.active ? "Ativo" : "Pausado"}</span>
                <button className="btn btn-sm" onClick={() => toggleExp(e)}>
                  {e.active ? "Pausar" : "Ativar"}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => deleteExp(e)}>
                  Excluir
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Variante</th>
                    <th>Fluxo</th>
                    <th>Peso</th>
                    <th>Visitantes</th>
                    <th>Início de conversa</th>
                    <th>Checkout</th>
                    <th>Vendas</th>
                    <th>Conversão</th>
                    <th>Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {e.report.map((r) => {
                    const best = Math.max(...e.report.map((x) => x.conversion));
                    return (
                      <tr key={r.variantId}>
                        <td className="strong">{r.label}</td>
                        <td>{r.funnelName}</td>
                        <td>{r.weight}%</td>
                        <td>{r.visitors}</td>
                        <td>
                          {r.chatStarted} <span className="hint">({pct(r.ctr)})</span>
                        </td>
                        <td>{r.checkouts}</td>
                        <td>{r.sales}</td>
                        <td className={r.conversion === best && best > 0 ? "gold strong" : ""}>{pct(r.conversion)}</td>
                        <td>{formatBRL(r.revenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <Modal title="Novo teste A/B" onClose={() => setCreating(false)}>
          <div className="field">
            <label>Nome</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: slugify(e.target.value) })} />
          </div>
          <div className="field">
            <label>URL do teste</label>
            <div className="row">
              <span className="dim" style={{ fontSize: 13 }}>
                {withBase("/f/")}
              </span>
              <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
            </div>
            <span className="hint">Use um slug diferente dos fluxos.</span>
          </div>
          <label className="label">Variantes</label>
          {form.variants.map((v, i) => (
            <div key={i} className="row" style={{ marginTop: 8 }}>
              <input
                className="input"
                style={{ width: 70 }}
                value={v.label}
                onChange={(e) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
              />
              <select
                className="select"
                value={v.funnelId}
                onChange={(e) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, funnelId: e.target.value } : x)) })}
              >
                <option value="">Fluxo...</option>
                {funnels?.funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ width: 80 }}
                type="number"
                min={0}
                max={100}
                value={v.weight}
                onChange={(e) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })}
              />
              <span className="dim">%</span>
            </div>
          ))}
          {form.variants.length < 5 && (
            <button
              className="btn btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setForm({ ...form, variants: [...form.variants, { funnelId: "", label: String.fromCharCode(65 + form.variants.length), weight: 0 }] })}
            >
              + Variante
            </button>
          )}
          {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={createExp} disabled={!form.name || form.variants.some((v) => !v.funnelId)}>
              Criar teste
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
