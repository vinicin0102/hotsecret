import type { ReactNode } from "react";
import { formatTime } from "@/lib/format";

export function MessageBubble({
  sender,
  at,
  media,
  children,
}: {
  sender: "bot" | "user" | "system";
  at?: string;
  media?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`msg-row ${sender}`}>
      <div className={`bubble ${sender} ${media ? "media" : ""}`}>
        {children}
        {at && sender !== "system" && <span className="time">{formatTime(at)}</span>}
      </div>
    </div>
  );
}
