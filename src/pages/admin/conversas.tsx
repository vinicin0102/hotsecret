import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AiPausedPill, AiToggle } from "@/components/admin/AiToggle";
import { StageBadge } from "@/components/admin/Badges";
import { useFetch } from "@/hooks/useFetch";
import { formatDateTime } from "@/lib/format";

interface Row {
  id: string;
  lead: { id: string; name: string | null; email: string | null; stage: string; utmSource: string | null; aiPausedAt: string | null };
  funnel: string;
  status: string;
  messageCount: number;
  lastMessage: { sender: string; type: string; content: { text?: string } } | null;
  updatedAt: string;
}

export default function Conversations() {
  const router = useRouter();
  const { data, setData } = useFetch<{ conversations: Row[] }>("/api/admin/conversations");
  /** o mesmo lead pode ter mais de uma conversa: o botão muda todas as linhas dele */
  const setPaused = (leadId: string, paused: boolean) =>
    data &&
    setData({
      conversations: data.conversations.map((c) => (c.lead.id === leadId ? { ...c, lead: { ...c.lead, aiPausedAt: paused ? new Date().toISOString() : null } } : c)),
    });
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
              <th>IA</th>
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
                  <StageBadge stage={c.lead.stage} /> {c.status === "completed" && <span className="pill">concluída</span>}{" "}
                  {c.lead.aiPausedAt && <AiPausedPill />}
                </td>
                <td className="dim">{formatDateTime(c.updatedAt)}</td>
                <td>
                  <AiToggle key={`${c.lead.id}:${!!c.lead.aiPausedAt}`} leadId={c.lead.id} paused={!!c.lead.aiPausedAt} onChange={(p) => setPaused(c.lead.id, p)} small />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.conversations.length === 0 && <div className="empty">Nenhuma conversa ainda.</div>}
      </div>
    </AdminLayout>
  );
}
