import { useChatI18n } from "@/features/i18n/chat";

export function TypingIndicator() {
  const { t } = useChatI18n();
  return (
    <div className="msg-row bot" aria-label={t.typing}>
      <div className="typing">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
