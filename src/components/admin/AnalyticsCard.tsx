import type { ReactNode } from "react";

export function AnalyticsCard({ label, value, hint, gold }: { label: string; value: ReactNode; hint?: ReactNode; gold?: boolean }) {
  return (
    <div className={`card stat ${gold ? "gold" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="delta">{hint}</div>}
    </div>
  );
}
