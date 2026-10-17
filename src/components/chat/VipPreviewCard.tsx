// "Como é o meu VIP": card que o Cérebro manda no chat com a prévia do Grupo VIP — capa, foto, quantas
// fotos/vídeos, mosaico (o grátis à vista, o resto borrado com cadeado) e benefícios.
// No chat é um BÔNUS (ex.: da chamada de vídeo): sem preço, sem botão e sem link — só aumenta o valor da oferta.
// No upsell "Grupo VIP" da chamada, o rodapé (footer) traz o preço e o botão de compra.
import type { ReactNode } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { VipPreviewCard as Card } from "@/services/vip";

export function VipPreviewCard({ card, tag, footer }: { card: Card; tag?: string; footer?: ReactNode }) {
  const { t } = useChatI18n();
  const tiles = card.tiles.slice(0, 6);
  return (
    <div className="msg-row bot">
      <div className="vipc">
        <div className="vipc-cover" style={card.coverUrl ? { backgroundImage: `url(${card.coverUrl})` } : undefined}>
          <span className="vipc-tag">{tag ?? `🎁 ${t.vipTag}`}</span>
        </div>
        <div className="vipc-id">
          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="vipc-avatar" src={card.avatarUrl} alt="" />
          ) : (
            <span className="vipc-avatar">{card.name.slice(0, 1)}</span>
          )}
          <div>
            <b>
              {card.name} <span className="vipc-ok">✓</span>
            </b>
            <small>
              📷 {card.counts.images} {t.vipPhotos} · 🎬 {card.counts.videos} {t.vipVideos}
            </small>
          </div>
        </div>
        {tiles.length > 0 && (
          <div className={`vipc-grid n${Math.min(tiles.length, 6)}`}>
            {tiles.map((m, i) => (
              <span key={i} className={`vipc-tile ${m.url ? "" : "locked"}`}>
                {m.url ? (
                  m.kind === "video" ? (
                    <video src={`${m.url}#t=0.5`} muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" loading="lazy" />
                  )
                ) : m.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="vipc-blur" src={m.preview} alt="" loading="lazy" />
                ) : (
                  <span className="vipc-blur vipc-blur-empty" />
                )}
                {!m.url && <span className="vipc-lock">🔒</span>}
                {m.kind === "video" && <span className="vipc-kind">▶</span>}
              </span>
            ))}
          </div>
        )}
        <div className="vipc-body">
          {card.headline && <p className="vipc-head">{card.headline}</p>}
          {card.perks.length > 0 && (
            <ul className="vipc-perks">
              {card.perks.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {footer ?? <div className="vipc-bonus">🎁 {card.bonus || t.vipBonus}</div>}
        </div>
      </div>
    </div>
  );
}
