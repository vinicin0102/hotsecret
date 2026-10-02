import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { StageBadge } from "@/components/admin/Badges";
import { useFetch } from "@/hooks/useFetch";
import { formatDateTime } from "@/lib/format";

interface Row {
  id: string;
  lead: { id: string; name: string | null; email: string | null; stage: string; utmSource: string | null };
  funnel: string;
  status: string;
  messageCount: number;
  lastMessage: { sender: string; type: string; content: { text?: string } } | null;
  updatedAt: string;
}

export default function Conversations() {
  const router = useRouter();
  const { data } = useFetch<{ conversations: Row[] }>("/api/admin/conversations");
  return (
    <AdminLayout title="Conversas" subtitle="Conversas mais recentes — clique para ver o chat completo">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Fluxo</th>
              <th>Última mensagem</th>
              <th>Mensagens</th>
              <th>Status</th>
              <th>Atualizada</th>
            </tr>
          </thead>
          <tbody>
            {data?.conversations.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => router.push(`/admin/leads/${c.lead.id}`)}>
                <td className="strong">
                  {c.lead.name || <span className="dim">Visitante anônimo</span>}
                  {c.lead.email && <div className="hint">{c.lead.email}</div>}
                </td>
                <td>{c.funnel}</td>
                <td style={{ maxWidth: 320 }}>
                  <span className="dim">{c.lastMessage?.sender === "user" ? "Lead: " : c.lastMessage?.sender === "system" ? "Sistema: " : "Personagem: "}</span>
                  {c.lastMessage?.content?.text ? String(c.lastMessage.content.text).slice(0, 80) : `[${c.lastMessage?.type ?? "—"}]`}
                </td>
                <td>{c.messageCount}</td>
                <td>
                  <StageBadge stage={c.lead.stage} /> {c.status === "completed" && <span className="pill">concluída</span>}
                </td>
                <td className="dim">{formatDateTime(c.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.conversations.length === 0 && <div className="empty">Nenhuma conversa ainda.</div>}
      </div>
    </AdminLayout>
  );
}
