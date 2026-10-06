import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PaymentBadge, STAGE_LABEL, TagChip } from "@/components/admin/Badges";
import { ConversationViewer, type ViewerMessage } from "@/components/admin/ConversationViewer";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatBRL, formatDateTime } from "@/lib/format";

interface LeadDetail {
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    cpf: string | null;
    stage: string;
    currentNodeId: string | null;
    variables: Record<string, string>;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    referrer: string | null;
    landingPage: string | null;
    device: string | null;
    browser: string | null;
    os: string | null;
    country: string | null;
    createdAt: string;
    lastInteractionAt: string;
    funnel: { id: string; name: string; slug: string } | null;
    tags: { tag: { id: string; name: string; color: string }; source: string }[];
    payments: { id: string; status: string; amount: number; method: string; createdAt: string; product: { name: string } }[];
    conversations: { id: string; status: string; startedAt: string; messages: ViewerMessage[] }[];
    events: { id: string; type: string; nodeId: string | null; data: Record<string, unknown>; createdAt: string }[];
  };
  nodes: { id: string; type: string; settings: { label?: string } }[];
}

const EVENT_LABEL: Record<string, string> = {
  page_view: "Visitou a página",
  chat_started: "Iniciou a conversa",
  button_clicked: "Clicou em botão",
  question_answered: "Respondeu pergunta",
  image_viewed: "Viu imagem",
  photo_sent: "Enviou foto",
  video_started: "Iniciou vídeo",
  audio_played: "Ouviu áudio",
  offer_viewed: "Viu a oferta",
  offer_clicked: "Clicou na oferta",
  checkout_started: "Iniciou checkout",
  payment_created: "Pagamento criado",
  payment_pending: "Pagamento pendente",
  payment_approved: "Pagamento aprovado",
  payment_failed: "Pagamento recusado",
  payment_refunded: "Pagamento estornado",
  checkout_recovery_sent: "Recuperação enviada",
  delivery_viewed: "Acessou o produto",
  link_clicked: "Clicou em link",
  chat_completed: "Concluiu a conversa",
};

export default function LeadPage() {
  const router = useRouter();
  const id = router.query.id ? String(router.query.id) : null;
  const { data, reload } = useFetch<LeadDetail>(id ? `/api/admin/leads/${id}` : null);
  const { data: allTags } = useFetch<{ tags: { id: string; name: string; color: string }[] }>("/api/admin/tags");
  const [addingTag, setAddingTag] = useState("");
  const [showAllEvents, setShowAllEvents] = useState(false);

  if (!data) return <AdminLayout title="Lead">Carregando...</AdminLayout>;
  const l = data.lead;
  const nodeLabel = (nid: string | null) => {
    if (!nid) return "—";
    const n = data.nodes.find((x) => x.id === nid);
    return n ? `${n.settings?.label || n.type} (${nid})` : nid;
  };
  const messages = l.conversations.flatMap((c) => c.messages).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const approved = l.payments.find((p) => p.status === "APPROVED");
  const journey = l.events.filter((e) => e.type !== "node_entered" && e.type !== "message_viewed");

  const addTag = async () => {
    if (!addingTag) return;
    await api(`/api/admin/leads/${l.id}/tags`, { body: { tagId: addingTag } });
    setAddingTag("");
    void reload();
  };
  const removeTag = async (tagId: string) => {
    await api(`/api/admin/leads/${l.id}/tags`, { method: "DELETE", body: { tagId } });
    void reload();
  };
  const setStage = async (stage: string) => {
    await api(`/api/admin/leads/${l.id}`, { method: "PATCH", body: { stage } });
    void reload();
  };

  return (
    <AdminLayout
      title={l.name || "Visitante anônimo"}
      subtitle={<Link href="/admin/leads">← Voltar para leads</Link>}
    >
      <div className="split">
        <div className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            Informações do lead
          </div>
          <dl className="kv">
            <dt>Nome</dt>
            <dd>{l.name || "—"}</dd>
            <dt>E-mail</dt>
            <dd>{l.email || "—"}</dd>
            <dt>Telefone</dt>
            <dd>{l.phone || "—"}</dd>
            <dt>Origem</dt>
            <dd>{l.utmSource || l.referrer || "Direto"}</dd>
            <dt>Fluxo</dt>
            <dd>{l.funnel ? <Link href={`/admin/fluxos/${l.funnel.id}`}>{l.funnel.name}</Link> : "—"}</dd>
            <dt>Etapa atual</dt>
            <dd>{nodeLabel(l.currentNodeId)}</dd>
            <dt>Status</dt>
            <dd>
              <select className="select" style={{ padding: "4px 8px" }} value={l.stage} onChange={(e) => setStage(e.target.value)}>
                {Object.entries(STAGE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </dd>
            <dt>Produto</dt>
            <dd>{approved ? approved.product.name : "—"}</dd>
            <dt>Pagamento</dt>
            <dd>{l.payments[0] ? <PaymentBadge status={l.payments[0].status} /> : "—"}</dd>
          </dl>

          <div className="section-title">Tags</div>
          <div>
            {l.tags.map((t) => (
              <TagChip key={t.tag.id} name={t.tag.name} color={t.tag.color} onRemove={() => removeTag(t.tag.id)} />
            ))}
            {!l.tags.length && <span className="dim">Nenhuma tag</span>}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <select className="select" value={addingTag} onChange={(e) => setAddingTag(e.target.value)}>
              <option value="">Adicionar tag...</option>
              {allTags?.tags
                .filter((t) => !l.tags.some((x) => x.tag.id === t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            <button className="btn btn-sm" onClick={addTag} disabled={!addingTag}>
              Aplicar
            </button>
          </div>

          <div className="section-title">UTM e dispositivo</div>
          <dl className="kv">
            <dt>utm_source</dt>
            <dd>{l.utmSource || "—"}</dd>
            <dt>utm_medium</dt>
            <dd>{l.utmMedium || "—"}</dd>
            <dt>utm_campaign</dt>
            <dd>{l.utmCampaign || "—"}</dd>
            <dt>utm_content</dt>
            <dd>{l.utmContent || "—"}</dd>
            <dt>utm_term</dt>
            <dd>{l.utmTerm || "—"}</dd>
            <dt>Referrer</dt>
            <dd>{l.referrer || "—"}</dd>
            <dt>Landing</dt>
            <dd>{l.landingPage || "—"}</dd>
            <dt>Dispositivo</dt>
            <dd>
              {l.device} · {l.browser} · {l.os}
            </dd>
            <dt>País</dt>
            <dd>{l.country || "—"}</dd>
            <dt>Criado em</dt>
            <dd>{formatDateTime(l.createdAt)}</dd>
          </dl>

          {Object.keys(l.variables ?? {}).length > 0 && (
            <>
              <div className="section-title">Respostas</div>
              <dl className="kv">
                {Object.entries(l.variables).map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          <div className="section-title">Pagamentos</div>
          {l.payments.length === 0 && <span className="dim">Nenhum pagamento</span>}
          <div className="inline-list">
            {l.payments.map((p) => (
              <div key={p.id} className="inline-item">
                <PaymentBadge status={p.status} />
                <span>{p.product.name}</span>
                <b>{formatBRL(p.amount)}</b>
                <span className="hint">
                  {p.method} · {formatDateTime(p.createdAt)}
                </span>
              </div>
            ))}
          </div>

          <div className="section-title">Jornada</div>
          <div className="inline-list" style={{ gap: 4 }}>
            {(showAllEvents ? journey : journey.slice(-25)).map((e) => (
              <div key={e.id} className="hint">
                {formatDateTime(e.createdAt)} — <span style={{ color: "var(--text)" }}>{EVENT_LABEL[e.type] ?? e.type}</span>
                {typeof e.data?.label === "string" ? ` “${e.data.label}”` : ""}
                {typeof e.data?.utm_campaign === "string" ? ` (${e.data.utm_campaign})` : ""}
              </div>
            ))}
            {journey.length > 25 && !showAllEvents && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAllEvents(true)}>
                Ver todos ({journey.length})
              </button>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-head" style={{ padding: "16px 18px 0" }}>
            <h3>Conversa</h3>
            <span className="hint">{messages.length} mensagens</span>
          </div>
          <ConversationViewer messages={messages} />
        </div>
      </div>
    </AdminLayout>
  );
}
