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
        <button className="back" aria-label={t.aBack} onClick={() => (onBack ? onBack() : history.back())}>
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
                {/* status padrão "online" no idioma do fluxo; texto próprio do dono aparece como escrito */}
                {/^online$/i.test(character.status.trim()) ? t.online : character.status}
              </>
            )}
          </div>
        </div>
        <button className="info" aria-label={t.aInfo} onClick={() => setInfo((v) => !v)}>
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

const Chevron = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const VideoOutline = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
    <rect x="2.5" y="6" width="13.5" height="12" rx="2.5" />
    <path d="m16 10.5 5.5-3.2v9.4L16 13.5z" />
  </svg>
);
const PhoneOutline = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d="M6.6 3.5h2.6l1.4 4.2-2 1.4a12 12 0 0 0 6.3 6.3l1.4-2 4.2 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

/** Tema mensageiro: cabeçalho escuro (voltar, foto, nome, status) e, ao tocar no nome, a tela "Dados do contato". */
export function MessengerHeader({ character, typing, onBack }: { character: PublicCharacter; typing: boolean; onBack?: () => void }) {
  const [info, setInfo] = useState(false);
  const { t } = useChatI18n();
  const status = typing ? t.typing : /^online$/i.test(character.status.trim()) ? t.online : character.status;
  return (
    <>
      <header className="chat-header ms-header">
        <button className="ms-back" aria-label={t.aBack} onClick={() => (onBack ? onBack() : history.back())}>
          <Chevron />
        </button>
        <button className="ms-who" onClick={() => setInfo(true)} aria-label={t.contactInfo}>
          <Avatar character={character} size={38} />
          <span className="ms-who-text">
            <span className="name">{character.name}</span>
            <span className={`status ${typing ? "is-typing" : ""}`}>{status}</span>
          </span>
        </button>
        <div className="ms-actions">
          <button className="ms-act" aria-label={t.contactInfo} onClick={() => setInfo(true)}>
            <VideoOutline />
          </button>
          <button className="ms-act" aria-label={t.contactInfo} onClick={() => setInfo(true)}>
            <PhoneOutline />
          </button>
        </div>
      </header>
      {info && (
        <div className="ms-contact" role="dialog" aria-label={t.contactInfo}>
          <div className="ms-contact-top">
            <button className="ms-back" aria-label={t.aBack} onClick={() => setInfo(false)}>
              <Chevron />
            </button>
            <span>{t.contactInfo}</span>
          </div>
          <div className="ms-contact-photo">
            {character.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={character.avatarUrl} alt={character.name} />
            ) : (
              <span>{character.name.slice(0, 1)}</span>
            )}
          </div>
          <div className="ms-contact-name">{character.name}</div>
          <div className="ms-contact-status">{status}</div>
          {character.description && (
            <div className="ms-contact-card">
              <small>{t.contactAbout}</small>
              <p>{character.description}</p>
            </div>
          )}
          <div className="ms-contact-card">
            <p>🔒 {t.contactPrivate}</p>
            <small>{t.botNotice}</small>
          </div>
        </div>
      )}
    </>
  );
}
