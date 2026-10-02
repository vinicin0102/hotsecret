import { formatNumber } from "@/lib/format";

export interface Step {
  key: string;
  label: string;
  value: number;
  rateFromPrevious: number;
  rateFromStart: number;
}

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function FunnelSteps({ steps }: { steps: Step[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="funnel-steps">
      {steps.map((s, i) => (
        <div key={s.key} className="funnel-step">
          <div>
            <div style={{ fontWeight: 600 }}>{s.label}</div>
            <div className="hint">{i === 0 ? "base" : `${pct(s.rateFromStart)} do total`}</div>
          </div>
          <div className="bar">
            <i style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }} />
            <span>{formatNumber(s.value)}</span>
          </div>
          <div className="rate">{i === 0 ? "—" : <><b>{pct(s.rateFromPrevious)}</b> da etapa anterior</>}</div>
        </div>
      ))}
    </div>
  );
}
