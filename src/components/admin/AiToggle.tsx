// Encerrar / reativar a IA para um lead (chat do site e WhatsApp). Usado nas Conversas e na página do lead.
import { useState } from "react";
import { api } from "@/lib/client";

export function AiToggle({ leadId, paused, onChange, small }: { leadId: string; paused: boolean; onChange?: (paused: boolean) => void; small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(paused);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // na lista, a linha abre o lead: o botão não
    const next = !state;
    if (next && !confirm("Encerrar a IA para este lead? Ela para de responder no chat e no WhatsApp até você reativar.")) return;
    setBusy(true);
    try {
      await api(`/api/admin/leads/${leadId}`, { method: "PATCH", body: { aiPaused: next } });
      setState(next);
      onChange?.(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível alterar a IA");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className={`btn ${small ? "btn-sm" : ""} ${state ? "btn-primary" : "btn-ghost"} ai-toggle`}
      onClick={(e) => void toggle(e)}
      disabled={busy}
      title={state ? "A IA não responde este lead. Clique para ela voltar a responder." : "Faz a IA parar de responder este lead (chat e WhatsApp)"}
    >
      {busy ? "..." : state ? "▶ Reativar IA" : "⏹ Encerrar IA"}
    </button>
  );
}

/** etiqueta para quem está com a IA encerrada */
export function AiPausedPill() {
  return <span className="pill ai-paused-pill">IA encerrada</span>;
}
