import Link from "next/link";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AnalyticsCard } from "@/components/admin/AnalyticsCard";
import { PAYMENT_LABEL, PaymentBadge } from "@/components/admin/Badges";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatBRL, formatDateTime, formatMoney } from "@/lib/format";

interface Row {
  id: string;
  status: string;
  method: string;
  amount: number;
  currency?: string;
  provider: string;
  providerPaymentId: string | null;
  product: string;
  funnel: string;
  lead: { id: string; name: string | null; utmCampaign: string | null };
  customerName: string;
  customerEmail: string;
  createdAt: string;
  approvedAt: string | null;
}
interface Resp {
  provider: string;
  sandbox: boolean;
  totals: Record<string, { count: number; amount: number }>;
  totalsMXN?: Record<string, { count: number; amount: number }>;
  totalsARS?: Record<string, { count: number; amount: number }>;
  payments: Row[];
}

export default function Payments() {
  const [status, setStatus] = useState("");
  const { data, reload } = useFetch<Resp>(`/api/admin/payments?status=${status}`);
  const t = data?.totals ?? {};

  const simulate = async (id: string, s: string) => {
    await api(`/api/admin/payments/${id}/simulate`, { body: { status: s } });
    void reload();
  };

  return (
    <AdminLayout title="Pagamentos" subtitle={data ? `Gateway: ${data.provider}${data.sandbox ? " (ambiente de teste)" : ""} · confirmações via webhook` : ""}>
      <div className="stats-grid">
        <AnalyticsCard label="Aprovados" value={formatBRL(t.APPROVED?.amount ?? 0)} hint={`${t.APPROVED?.count ?? 0} pagamentos`} gold />
        <AnalyticsCard label="Pendentes" value={String((t.PENDING?.count ?? 0) + (t.CREATED?.count ?? 0))} hint={formatBRL((t.PENDING?.amount ?? 0) + (t.CREATED?.amount ?? 0))} />
        <AnalyticsCard label="Recusados" value={String(t.FAILED?.count ?? 0)} />
        <AnalyticsCard label="Estornados" value={String(t.REFUNDED?.count ?? 0)} hint={formatBRL(t.REFUNDED?.amount ?? 0)} />
        {data?.totalsMXN && Object.keys(data.totalsMXN).length > 0 && (
          <AnalyticsCard
            label="Aprovados México (MXN)"
            value={formatMoney(data.totalsMXN.APPROVED?.amount ?? 0, "MXN")}
            hint={`${data.totalsMXN.APPROVED?.count ?? 0} pagamentos`}
            gold
          />
        )}
        {data?.totalsARS && Object.keys(data.totalsARS).length > 0 && (
          <AnalyticsCard
            label="Aprovados Argentina (ARS)"
            value={formatMoney(data.totalsARS.APPROVED?.amount ?? 0, "ARS")}
            hint={`${data.totalsARS.APPROVED?.count ?? 0} pagamentos`}
            gold
          />
        )}
      </div>
      <div className="card-head">
        <div className="segmented">
          <button className={status === "" ? "active" : ""} onClick={() => setStatus("")}>
            Todos
          </button>
          {Object.entries(PAYMENT_LABEL).map(([k, v]) => (
            <button key={k} className={status === k ? "active" : ""} onClick={() => setStatus(k)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Cliente</th>
              <th>Produto</th>
              <th>Valor</th>
              <th>Método</th>
              <th>Fluxo / campanha</th>
              <th>Gateway</th>
              <th>Criado</th>
              {data?.sandbox && <th>Teste</th>}
            </tr>
          </thead>
          <tbody>
            {data?.payments.map((p) => (
              <tr key={p.id}>
                <td>
                  <PaymentBadge status={p.status} />
                </td>
                <td>
                  <Link href={`/admin/leads/${p.lead.id}`}>{p.customerName}</Link>
                  <div className="hint">{p.customerEmail}</div>
                </td>
                <td>{p.product}</td>
                <td className="strong">{formatMoney(p.amount, p.currency)}</td>
                <td>{p.method === "PIX" ? "PIX" : "Cartão"}</td>
                <td>
                  {p.funnel}
                  {p.lead.utmCampaign && <div className="hint">{p.lead.utmCampaign}</div>}
                </td>
                <td className="hint">
                  {p.provider}
                  <div>{p.providerPaymentId ?? "—"}</div>
                </td>
                <td className="dim">
                  {formatDateTime(p.createdAt)}
                  {p.approvedAt && <div className="check-ok">✓ {formatDateTime(p.approvedAt)}</div>}
                </td>
                {data?.sandbox && (
                  <td>
                    {p.provider === "sandbox" && (p.status === "PENDING" || p.status === "CREATED") && (
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn-sm" onClick={() => simulate(p.id, "APPROVED")}>
                          Aprovar
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => simulate(p.id, "FAILED")}>
                          Recusar
                        </button>
                      </div>
                    )}
                    {p.provider === "sandbox" && p.status === "APPROVED" && (
                      <button className="btn btn-sm" onClick={() => simulate(p.id, "REFUNDED")}>
                        Estornar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.payments.length === 0 && <div className="empty">Nenhum pagamento.</div>}
      </div>
    </AdminLayout>
  );
}
