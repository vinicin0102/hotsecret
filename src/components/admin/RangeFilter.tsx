import { useState } from "react";

export type RangeValue = { range: string; from?: string; to?: string };

export function rangeQuery(r: RangeValue): string {
  const p = new URLSearchParams({ range: r.range });
  if (r.range === "custom" && r.from && r.to) {
    p.set("from", r.from);
    p.set("to", r.to);
  }
  return p.toString();
}

export function RangeFilter({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const opts = [
    ["today", "Hoje"],
    ["7d", "7 dias"],
    ["30d", "30 dias"],
    ["custom", "Personalizado"],
  ];
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <div className="segmented">
        {opts.map(([k, l]) => (
          <button key={k} className={value.range === k ? "active" : ""} onClick={() => (k === "custom" ? onChange({ range: k, from, to }) : onChange({ range: k }))}>
            {l}
          </button>
        ))}
      </div>
      {value.range === "custom" && (
        <div className="row">
          <input type="date" className="input" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="dim">até</span>
          <input type="date" className="input" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn btn-sm" disabled={!from || !to} onClick={() => onChange({ range: "custom", from, to })}>
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
