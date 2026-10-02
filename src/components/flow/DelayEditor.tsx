// Editor do atraso entre mensagens (usado no bloco e nas configurações do fluxo).
import { useId } from "react";
import type { DelayMode } from "@/types/flow";

export interface DelayValue {
  mode: DelayMode;
  ms?: number;
  minMs?: number;
  maxMs?: number;
}

const LABELS: Record<DelayMode, string> = {
  inherit: "Padrão do fluxo",
  auto: "Automático",
  fixed: "Fixo",
  random: "Aleatório",
};

const HINTS: Record<DelayMode, string> = {
  inherit: "Usa o atraso definido em ⚙ Configurar → Tempo entre mensagens.",
  auto: "Proporcional ao tamanho do texto, como alguém digitando de verdade (entre 1s e 6s).",
  fixed: "Sempre o mesmo tempo antes de a mensagem aparecer.",
  random: "Um tempo sorteado entre o mínimo e o máximo — fica mais natural.",
};

function Seconds({ label, value, onChange }: { label: string; value: number; onChange: (ms: number) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type="number"
        min={0}
        max={60}
        step={0.5}
        value={value / 1000}
        onChange={(e) => onChange(Math.max(0, Math.min(60000, Math.round(Number(e.target.value) * 1000))))}
      />
    </div>
  );
}

export function DelayEditor({ value, onChange, allowInherit }: { value: DelayValue; onChange: (v: DelayValue) => void; allowInherit?: boolean }) {
  const modes: DelayMode[] = allowInherit ? ["inherit", "auto", "fixed", "random"] : ["auto", "fixed", "random"];
  return (
    <>
      <div className="field">
        <div className="segmented">
          {modes.map((m) => (
            <button key={m} type="button" className={value.mode === m ? "active" : ""} onClick={() => onChange({ ...value, mode: m })}>
              {LABELS[m]}
            </button>
          ))}
        </div>
        <span className="hint">{HINTS[value.mode]}</span>
      </div>
      {value.mode === "fixed" && <Seconds label="Atraso (segundos)" value={value.ms ?? 1500} onChange={(ms) => onChange({ ...value, ms })} />}
      {value.mode === "random" && (
        <div className="grid-2">
          <Seconds label="Mínimo (s)" value={value.minMs ?? 1000} onChange={(minMs) => onChange({ ...value, minMs })} />
          <Seconds label="Máximo (s)" value={value.maxMs ?? 4000} onChange={(maxMs) => onChange({ ...value, maxMs })} />
        </div>
      )}
    </>
  );
}
