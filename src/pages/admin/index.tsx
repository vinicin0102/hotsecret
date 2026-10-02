import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AnalyticsCard } from "@/components/admin/AnalyticsCard";
import { RangeFilter, rangeQuery, type RangeValue } from "@/components/admin/RangeFilter";
import { useFetch } from "@/hooks/useFetch";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";

interface DashboardData {
  cards: { visitors: number; conversations: number; checkouts: number; sales: number; revenue: number };
  series: { date: string; visitantes: number; conversas: number; checkout: number; vendas: number }[];
}

const SERIES = [
  { key: "visitantes", color: "#B9AAB3" },
  { key: "conversas", color: "#F29AB8" },
  { key: "checkout", color: "#D94F7D" },
  { key: "vendas", color: "#D8A85C" },
];

export default function Dashboard() {
  const [range, setRange] = useState<RangeValue>({ range: "7d" });
  const { data, loading, error } = useFetch<DashboardData>(`/api/admin/dashboard?${rangeQuery(range)}`);
  const c = data?.cards;

  return (
    <AdminLayout title="Dashboard" subtitle="Visão geral dos seus funis conversacionais" actions={<RangeFilter value={range} onChange={setRange} />}>
      {error && <div className="error-text">{error}</div>}
      <div className="stats-grid">
        <AnalyticsCard label="Visitantes" value={c ? formatNumber(c.visitors) : "—"} />
        <AnalyticsCard label="Conversas" value={c ? formatNumber(c.conversations) : "—"} hint={c && formatPercent(c.conversations, c.visitors) + " dos visitantes"} />
        <AnalyticsCard label="Checkouts" value={c ? formatNumber(c.checkouts) : "—"} hint={c && formatPercent(c.checkouts, c.conversations) + " das conversas"} />
        <AnalyticsCard label="Vendas" value={c ? formatNumber(c.sales) : "—"} hint={c && formatPercent(c.sales, c.visitors) + " de conversão"} />
        <AnalyticsCard label="Faturamento" value={c ? formatBRL(c.revenue) : "—"} gold />
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Desempenho no período</h3>
          {loading && <span className="spinner" />}
        </div>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <AreaChart data={data?.series ?? []} margin={{ left: -10, right: 10, top: 10 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis dataKey="date" stroke="#7f6e79" fontSize={12} tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} />
              <YAxis stroke="#7f6e79" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#160B16", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12 }} />
              <Legend />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} fill={`url(#g-${s.key})`} strokeWidth={2} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AdminLayout>
  );
}
