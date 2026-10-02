import { useMemo } from "react";

/** Brilhos muito sutis subindo ao fundo. */
export function Particles({ count = 22 }: { count?: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        top: `${60 + ((i * 53) % 45)}%`,
        delay: `${(i * 1.7) % 14}s`,
        duration: `${12 + ((i * 7) % 10)}s`,
      })),
    [count],
  );
  return (
    <div className="particles" aria-hidden="true">
      {dots.map((d, i) => (
        <span key={i} style={{ left: d.left, top: d.top, animationDelay: d.delay, animationDuration: d.duration }} />
      ))}
    </div>
  );
}
