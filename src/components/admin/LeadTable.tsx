import { useRouter } from "next/router";
import { formatBRL, formatDateTime } from "@/lib/format";
import { StageBadge, TagChip } from "./Badges";

export interface LeadRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  origin: string;
  campaign: string | null;
  funnel: string;
  currentNodeId: string | null;
  stage: string;
  tags: { id: string; name: string; color: string }[];
  purchase: { amount: number; product: string } | null;
  lastInteractionAt: string;
  createdAt: string;
}

export function LeadTable({ leads }: { leads: LeadRow[] }) {
  const router = useRouter();
  if (!leads.length) return <div className="table-wrap empty">Nenhum lead encontrado.</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Contato</th>
            <th>Origem</th>
            <th>Fluxo</th>
            <th>Última interação</th>
            <th>Etapa</th>
            <th>Status</th>
            <th>Compra</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="clickable" onClick={() => router.push(`/admin/leads/${l.id}`)}>
              <td className="strong">{l.name || <span className="dim">Visitante anônimo</span>}</td>
              <td>
                <div>{l.email || "—"}</div>
                {l.phone && <div className="hint">{l.phone}</div>}
              </td>
              <td>
                <div>{l.origin}</div>
                {l.campaign && <div className="hint">{l.campaign}</div>}
              </td>
              <td>{l.funnel}</td>
              <td>{formatDateTime(l.lastInteractionAt)}</td>
              <td>
                <code className="inline">{l.currentNodeId ?? "—"}</code>
              </td>
              <td>
                <StageBadge stage={l.stage} />
                <div style={{ marginTop: 4 }}>
                  {l.tags.map((t) => (
                    <TagChip key={t.id} name={t.name} color={t.color} />
                  ))}
                </div>
              </td>
              <td>{l.purchase ? <span className="gold">{formatBRL(l.purchase.amount)}</span> : <span className="dim">—</span>}</td>
              <td className="dim">{formatDateTime(l.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
