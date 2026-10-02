import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AnalyticsCard } from "@/components/admin/AnalyticsCard";
import { CampaignTable, type CampaignRow } from "@/components/admin/CampaignTable";
import { FunnelSteps, type Step } from "@/components/admin/FunnelSteps";
import { RangeFilter, rangeQuery, type RangeValue } from "@/components/admin/RangeFilter";
import { useFetch } from "@/hooks/useFetch";
import { formatBRL, formatNumber } from "@/lib/format";

interface Resp {
  funnel: { id: string; name: string; slug: string };
  steps: Step[];
  series: { date: string; visitantes: number; conversas: number; checkout: number; vendas: number }[];
  revenue: { amount: number; count: number };
  campaigns: CampaignRow[];
  buttons: { nodeId: string; label: string; count: number }[];
}

export default function FunnelAnalytics() {
  const router = useRouter();
  const id = router.query.id ? String(router.query.id) : null;
  const [range, setRange] = useState<RangeValue>({ range: "30d" });
  const { data } = useFetch<Resp>(id ? `/api/admin/funnels/${id}/analytics?${rangeQuery(range)}` : null);
  const visitors = data?.steps[0]?.value ?? 0;

  return (
    <AdminLayout
      title={data ? `Analytics · ${data.funnel.name}` : "Analytics"}
      subtitle={id && <Link href={`/admin/fluxos/${id}`}>← Abrir no construtor</Link>}
      actions={<RangeFilter value={range} onChange={setRange} />}
    >
      <div className="stats-grid">
        <AnalyticsCard label="Visitantes" value={formatNumber(visitors)} />
        <AnalyticsCard label="Vendas" value={formatNumber(data?.revenue.count ?? 0)} />
        <AnalyticsCard
          label="Conversão"
          value={visitors ? `${(((data?.revenue.count ?? 0) / visitors) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0%"}
        />
        <AnalyticsCard label="Faturamento" value={formatBRL(data?.revenue.amount ?? 0)} gold />
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Funil</h3>
        {data && <FunnelSteps steps={data.steps} />}
      </div>
      <div className="settings-grid" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Botões mais clicados</h3>
          {data && data.buttons.length === 0 && <div className="empty">Nenhum clique no período.</div>}
          <div style={{ width: "100%", height: Math.max(160, (data?.buttons.length ?? 0) * 34) }}>
            <ResponsiveContainer>
              <BarChart data={data?.buttons ?? []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false} />
                <XAxis type="number" stroke="#7f6e79" fontSize={12} allowDecimals={false} />
                <YAxis type="category" dataKey="label" stroke="#B9AAB3" fontSize={12} width={120} />
                <Tooltip contentStyle={{ background: "#160B16", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} />
                <Bar dataKey="count" fill="#D94F7D" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Vendas por dia</h3>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={data?.series ?? []}>
                <CartesianGrid stroke="rgba(255,255,255,.05)" vertical={false} />
                <XAxis dataKey="date" stroke="#7f6e79" fontSize={11} tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} />
                <YAxis stroke="#7f6e79" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#160B16", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} />
                <Bar dataKey="checkout" fill="#6E173C" radius={[6, 6, 0, 0]} />
                <Bar dataKey="vendas" fill="#D8A85C" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Vendas por campanha</h3>
        <CampaignTable rows={data?.campaigns ?? []} />
      </div>
    </AdminLayout>
  );
}
