import { useMemo, useState } from "react";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Modal } from "@/components/ui/Modal";
import { createPreviewTransport } from "@/features/chat-engine/transport";
import type { OfferContent, PublicFunnel } from "@/types/flow";

/** Simulação real do chat com o fluxo atual (inclusive alterações não salvas). Nada é gravado. */
export function PreviewModal({ funnel, onClose }: { funnel: PublicFunnel; onClose: () => void }) {
  const [round, setRound] = useState(0);
  const transport = useMemo(
    () =>
      createPreviewTransport(funnel.products, (id) => {
        const n = funnel.graph.nodes.find((x) => x.id === id);
        return (n?.content as OfferContent | undefined)?.productId;
      },
      (id) => (funnel.graph.nodes.find((x) => x.id === id)?.content as { url?: string } | undefined)?.url || undefined,
      (id) => funnel.graph.nodes.find((x) => x.id === id)?.content as { brainId?: string; goal?: string } | undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round],
  );
  return (
    <Modal title="Preview" onClose={onClose} width={480}>
      <div className="preview-frame">
        <ChatWindow
          key={round}
          funnel={funnel}
          transport={transport}
          resume={null}
          embedded
          previewLabel="Pré-visualização · nada é salvo e o PIX é simulado"
          onRestart={() => setRound((r) => r + 1)}
        />
      </div>
      <div className="modal-actions">
        <button className="btn btn-sm" onClick={() => setRound((r) => r + 1)}>
          ↺ Reiniciar
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
