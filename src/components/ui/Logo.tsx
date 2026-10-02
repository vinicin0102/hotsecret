// Wordmark HOT SECRET + símbolo: balão de conversa com fechadura (segredo) e curva de coração sutil.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="hs-g" x1="4" y1="3" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F29AB8" />
          <stop offset="0.55" stopColor="#D94F7D" />
          <stop offset="1" stopColor="#6E173C" />
        </linearGradient>
      </defs>
      <path
        d="M16 3.5c7.2 0 12.5 4.9 12.5 11.1 0 6.2-5.3 11.1-12.5 11.1-1.3 0-2.6-.2-3.8-.5L6.6 28l1.3-5.1C5.2 20.9 3.5 18 3.5 14.6 3.5 8.4 8.8 3.5 16 3.5Z"
        stroke="url(#hs-g)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="12.6" r="2.7" fill="#D8A85C" />
      <path d="M14.6 14.4h2.8l.9 5.1h-4.6l.9-5.1Z" fill="#D8A85C" />
    </svg>
  );
}

export function Logo({ size = 28, compact = false }: { size?: number; compact?: boolean }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      {!compact && (
        <span>
          <span className="hot">HOT</span> <span className="secret">SECRET</span>
        </span>
      )}
    </span>
  );
}
