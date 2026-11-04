// Analytics → Perfil dos compradores: quem compra (origem, anúncio, aparelho, região, horário...) e quanto converte cada recorte.
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { formatMoney, formatPercent } from "@/lib/format";
import type { BuyerProfile as Profile, Highlight, ProfileDim, ProfileRow } from "@/services/buyer-profile";

type Money = ProfileRow["revenue"];

const DIM_LABEL: Record<ProfileDim, string> = {
  all: "Total",
  source: "Origem (utm_source)",
  campaign: "Campanha (utm_campaign)",
  adset: "Conjunto (utm_medium)",
  ad: "Anúncio (utm_content)",
  pixel: "Conta de anúncios (px)",
  device: "Aparelho",
  os: "Sistema",
  browser: "Navegador",
  country: "País",
  region: "Região",
  hour: "Hora em que chegou",
  weekday: "Dia da semana em que chegou",
  timeToBuy: "Tempo até comprar",
  purchases: "Compras por comprador",
};
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const TIME_TO_BUY: Record<string, string> = { "1": "até 5 min", "2": "5 a 15 min", "3": "15 min a 1 h", "4": "1 h a 1 dia", "5": "mais de 1 dia" };

/** valor de exibição: anúncio/campanha da UTMify vêm como "nome|id" — mostra o nome */
function label(dim: ProfileDim, v: string): string {
  if (dim === "hour") return `${v.padStart(2, "0")}h`;
  if (dim === "weekday") return WEEKDAYS[Number(v)] ?? v;
  if (dim === "timeToBuy") return TIME_TO_BUY[v] ?? v;
  if (dim === "purchases") return v === "1" ? "1 compra" : `${v} compras`;
  return v.includes("|") ? v.split("|")[0] || v : v;
}

function money(m: Money): string {
  const parts = (Object.entries(m) as [keyof Money, number][]).filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c));
  return parts.length ? parts.join(" + ") : "—";
}

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function DimTable({ dim, rows, buyersOnly }: { dim: ProfileDim; rows: ProfileRow[]; buyersOnly?: boolean }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <h4 style={{ margin: "0 0 8px" }}>{DIM_LABEL[dim]}</h4>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th />
              {!buyersOnly && <th>Leads</th>}
              <th>Compradores</th>
              {!buyersOnly && <th>Conv.</th>}
              <th>Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.value}>
                <td className="strong" title={r.value} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label(dim, r.value)}
                </td>
                {!buyersOnly && <td>{r.leads}</td>}
                <td>{r.buyers}</td>
                {!buyersOnly && <td>{formatPercent(r.buyers, r.leads)}</td>}
                <td className="gold">{money(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function highlightText(h: Highlight) {
  return `${DIM_LABEL[h.dim]}: ${label(h.dim, h.value)} — ${pct(h.conversion)} de conversão (${h.lift.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× a média · ${h.buyers} de ${h.leads} leads)`;
}

/** resumo em texto (sem dado pessoal) para colar no chat e pedir a análise */
function summaryText(p: Profile & { highlights: { best: Highlight[]; worst: Highlight[] } }): string {
  const all = p.dims.all?.[0];
  const lines = [`PERFIL DOS COMPRADORES`, all ? `Total: ${all.leads} leads, ${all.buyers} compradores (${formatPercent(all.buyers, all.leads)}), ${all.sales} vendas, ${money(all.revenue)}` : ""];
  for (const dim of Object.keys(DIM_LABEL) as ProfileDim[]) {
    if (dim === "all" || !p.dims[dim]?.length) continue;
    lines.push("", `## ${DIM_LABEL[dim]}`);
    for (const r of p.dims[dim]!) lines.push(`${label(dim, r.value)}: ${r.leads} leads, ${r.buyers} compradores (${formatPercent(r.buyers, r.leads)}), ${money(r.revenue)}`);
  }
  if (p.products.length) {
    lines.push("", "## Produtos");
    for (const r of p.products) lines.push(`${r.name}: ${r.sales} vendas, ${r.buyers} compradores, ${money(r.revenue)}`);
  }
  return lines.filter((l, i) => l || i > 1).join("\n");
}

export function BuyerProfile({ query }: { query: string }) {
  const { data, error } = useFetch<Profile & { highlights: { best: Highlight[]; worst: Highlight[] } }>(`/api/admin/analytics/buyers?${query}`);
  const [copied, setCopied] = useState(false);
  if (error) return <div className="error-text">Não foi possível montar o perfil agora (o banco demorou). Tente um período menor.</div>;
  if (!data) return <div className="empty">Montando o perfil dos compradores...</div>;
  const all = data.dims.all?.[0];
  if (!all?.buyers) return <div className="empty">Nenhuma venda no período para montar o perfil.</div>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* navegador sem permissão de copiar */
    }
  };
  const grid = (dims: ProfileDim[], buyersOnly = false) => (
    <div className="buyer-grid">
      {dims.filter((d) => data.dims[d]?.length).map((d) => <DimTable key={d} dim={d} rows={data.dims[d]!} buyersOnly={buyersOnly} />)}
    </div>
  );

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 10 }}>
        <p className="hint" style={{ margin: 0 }}>
          Leads que chegaram no período e quantos deles compraram (vendas de teste ficam de fora). <b>{all.leads}</b> leads ·{" "}
          <b>{all.buyers}</b> compradores · conversão <b>{formatPercent(all.buyers, all.leads)}</b> · {money(all.revenue)}
        </p>
        <button className="btn btn-sm" onClick={() => void copy()}>
          {copied ? "Copiado ✓" : "Copiar estudo (texto)"}
        </button>
      </div>

      {(data.highlights.best.length > 0 || data.highlights.worst.length > 0) && (
        <div className="buyer-highlights">
          {data.highlights.best.length > 0 && (
            <div>
              <div className="section-title">Converte acima da média</div>
              <ul>{data.highlights.best.map((h) => <li key={h.dim + h.value}>✅ {highlightText(h)}</li>)}</ul>
            </div>
          )}
          {data.highlights.worst.length > 0 && (
            <div>
              <div className="section-title">Converte bem abaixo da média</div>
              <ul>{data.highlights.worst.map((h) => <li key={h.dim + h.value}>⚠️ {highlightText(h)}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      <div className="section-title">Anúncios</div>
      {grid(["source", "campaign", "adset", "ad", "pixel"])}
      <div className="section-title">Quem é</div>
      {grid(["device", "os", "browser", "country", "region"])}
      <div className="section-title">Quando</div>
      {grid(["hour", "weekday"])}
      <div className="section-title">Como compra</div>
      {grid(["timeToBuy", "purchases"], true)}
      {data.products.length > 0 && (
        <div className="card" style={{ margin: "12px 0 0" }}>
          <h4 style={{ margin: "0 0 8px" }}>Produtos mais vendidos</h4>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Vendas</th>
                  <th>Compradores</th>
                  <th>Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.name}>
                    <td className="strong">{p.name}</td>
                    <td>{p.sales}</td>
                    <td>{p.buyers}</td>
                    <td className="gold">{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
