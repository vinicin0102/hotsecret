import { useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { PublicCharacter } from "@/types/flow";

export function Avatar({ character, size = 42 }: { character: PublicCharacter; size?: number }) {
  return (
    <div className="avatar" style={{ width: size, height: size }}>
      {character.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.avatarUrl} alt={character.name} />
      ) : (
        <span>{character.name.slice(0, 1)}</span>
      )}
      {character.showOnline && <span className="online" />}
    </div>
  );
}

export function ChatHeader({ character, typing, onBack }: { character: PublicCharacter; typing: boolean; onBack?: () => void }) {
  const [info, setInfo] = useState(false);
  const { t } = useChatI18n();
  return (
    <>
      <header className="chat-header">
        <button className="back" aria-label="Voltar" onClick={() => (onBack ? onBack() : history.back())}>
          ←
        </button>
        <Avatar character={character} />
        <div className="who">
          <div className="name">{character.name}</div>
          <div className={`status ${typing ? "is-typing" : ""}`}>
            {typing ? (
              t.typing
            ) : (
              <>
                {character.showOnline && <span className="dot" />}
                {character.status}
              </>
            )}
          </div>
        </div>
        <button className="info" aria-label="Informações" onClick={() => setInfo((v) => !v)}>
          i
        </button>
      </header>
      {info && (
        <div className="chat-info-panel">
          <strong>{character.name}</strong>
          {character.description && <div style={{ marginTop: 4 }}>{character.description}</div>}
          <div className="hint" style={{ marginTop: 10 }}>
            {t.botNotice}
          </div>
        </div>
      )}
    </>
  );
}
