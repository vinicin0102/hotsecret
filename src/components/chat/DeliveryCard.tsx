import { useState } from "react";

export function DeliveryCard({
  label,
  onOpen,
}: {
  label?: string;
  onOpen: () => Promise<{ url: string | null; productName: string }>;
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const open = async () => {
    setState("loading");
    setMessage(null);
    try {
      const r = await onOpen();
      if (r.url && r.url !== "#preview") window.open(r.url, "_blank", "noopener");
      if (!r.url) setMessage("Seu acesso foi liberado! Você receberá as instruções por e-mail.");
      setState("idle");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Não foi possível abrir agora.");
    }
  };

  return (
    <div className="msg-row bot">
      <div className="link-card">
        <button className="btn btn-gold cta-glow" style={{ marginTop: 0, minWidth: 240 }} onClick={open} disabled={state === "loading"}>
          {state === "loading" ? "Abrindo..." : label || "ACESSAR MEU PRODUTO"}
        </button>
        {message && <div className="hint">{message}</div>}
      </div>
    </div>
  );
}
