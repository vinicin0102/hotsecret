import type { ReactNode } from "react";
import { formatTime } from "@/lib/format";

export function MessageBubble({
  sender,
  at,
  media,
  from,
  children,
}: {
  sender: "bot" | "user" | "system";
  at?: string;
  media?: boolean;
  /** nome em cima do balão (Canal VIP AO VIVO) */
  from?: string;
  children: ReactNode;
}) {
  return (
    <div className={`msg-row ${sender}`}>
      <div className={`bubble ${sender} ${media ? "media" : ""}`}>
        {from && sender === "bot" && <div className="live-from">{from} 🔥</div>}
        {children}
        {at && sender !== "system" && <span className="time">{formatTime(at)}</span>}
      </div>
    </div>
  );
}
