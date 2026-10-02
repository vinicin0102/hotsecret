import { formatBRL, formatPercent } from "@/lib/format";

export interface CampaignRow {
  source: string;
  campaign: string;
  leads: number;
  checkouts: number;
  sales: number;
  revenue: number;
}

export function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  if (!rows.length) return <div className="empty">Sem dados de campanha no período.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>utm_source</th>
            <th>utm_campaign</th>
            <th>Leads</th>
            <th>Checkouts</th>
            <th>Vendas</th>
            <th>Conversão</th>
            <th>Faturamento</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.source}</td>
              <td className="strong">{r.campaign}</td>
              <td>{r.leads}</td>
              <td>{r.checkouts}</td>
              <td>{r.sales}</td>
              <td>{formatPercent(r.sales, r.leads)}</td>
              <td className="gold">{formatBRL(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
