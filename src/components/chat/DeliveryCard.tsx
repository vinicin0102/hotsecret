import { useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";

export function DeliveryCard({
  label,
  onOpen,
}: {
  label?: string;
  onOpen: () => Promise<{ url: string | null; productName: string }>;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const { t } = useChatI18n();

  const open = async () => {
    setState("loading");
    setMessage(null);
    try {
      const r = await onOpen();
      if (r.url && r.url !== "#preview") window.open(r.url, "_blank", "noopener");
      if (!r.url) setMessage(t.accessReleased);
      setState("idle");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : t.cantOpen);
    }
  };

  return (
    <div className="msg-row bot">
      <div className="link-card">
        <button className="btn btn-gold cta-glow" style={{ marginTop: 0, minWidth: 240 }} onClick={open} disabled={state === "loading"}>
          {state === "loading" ? t.opening : label || t.accessProduct}
        </button>
        {message && <div className="hint">{message}</div>}
      </div>
    </div>
  );
}
