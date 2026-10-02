import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { LeadTable, type LeadRow } from "@/components/admin/LeadTable";
import { useFetch } from "@/hooks/useFetch";
import { formatNumber } from "@/lib/format";

const FILTERS = [
  ["todos", "Todos", null],
  ["novos", "Novos", "NEW"],
  ["interessados", "Interessados", "INTERESTED"],
  ["checkout", "Checkout", "CHECKOUT"],
  ["compradores", "Compradores", "BUYER"],
  ["abandonaram", "Abandonaram", "ABANDONED"],
] as const;

interface Resp {
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  leads: LeadRow[];
}

export default function Leads() {
  const [filter, setFilter] = useState("todos");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [funnelId, setFunnelId] = useState("");
  const [tagId, setTagId] = useState("");
  const { data: funnels } = useFetch<{ funnels: { id: string; name: string }[] }>("/api/admin/funnels");
  const { data: tags } = useFetch<{ tags: { id: string; name: string }[] }>("/api/admin/tags");

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ filter, q: query, page: String(page), funnelId, tagId });
  const { data, loading } = useFetch<Resp>(`/api/admin/leads?${params}`);
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <AdminLayout title="Leads" subtitle="CRM de todos os visitantes que entraram nas conversas">
      <div className="card-head">
        <div className="segmented">
          {FILTERS.map(([k, label, stage]) => (
            <button
              key={k}
              className={filter === k ? "active" : ""}
              onClick={() => {
                setFilter(k);
                setPage(1);
              }}
            >
              {label} <span className="dim">{data ? formatNumber(stage ? (data.counts[stage] ?? 0) : total) : ""}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select className="select" style={{ width: 180 }} value={funnelId} onChange={(e) => setFunnelId(e.target.value)}>
            <option value="">Todos os fluxos</option>
            {funnels?.funnels.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: 160 }} value={tagId} onChange={(e) => setTagId(e.target.value)}>
            <option value="">Todas as tags</option>
            {tags?.tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input className="input" style={{ width: 240 }} placeholder="Buscar nome, e-mail, campanha..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {loading && !data ? <div className="empty">Carregando...</div> : <LeadTable leads={data?.leads ?? []} />}
      {data && data.total > data.pageSize && (
        <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Anterior
          </button>
          <span className="dim">
            Página {page} de {Math.ceil(data.total / data.pageSize)}
          </span>
          <button className="btn btn-sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>
            Próxima →
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
