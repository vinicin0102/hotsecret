export const STAGE_LABEL: Record<string, string> = {
  NEW: "Novo",
  INTERESTED: "Interessado",
  CHECKOUT: "Checkout",
  BUYER: "Comprador",
  ABANDONED: "Abandonou",
};

export const PAYMENT_LABEL: Record<string, string> = {
  CREATED: "Criado",
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  FAILED: "Falhou",
  REFUNDED: "Estornado",
};

export function StageBadge({ stage }: { stage: string }) {
  return <span className={`pill stage-${stage}`}>{STAGE_LABEL[stage] ?? stage}</span>;
}

export function PaymentBadge({ status }: { status: string }) {
  return <span className={`pill pay-${status}`}>{PAYMENT_LABEL[status] ?? status}</span>;
}

export function TagChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span className="tag-chip" style={{ color }}>
      {name}
      {onRemove && (
        <button aria-label={`Remover ${name}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
