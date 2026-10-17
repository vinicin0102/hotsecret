// "Como é o meu VIP": card que o Cérebro manda no chat com a prévia do Grupo VIP — capa, foto, quantas
// fotos/vídeos, mosaico (o grátis à vista, o resto borrado com cadeado) e benefícios.
// No chat é um BÔNUS (ex.: da chamada de vídeo): sem preço, sem botão e sem link — só aumenta o valor da oferta.
// No upsell "Grupo VIP" da chamada, o rodapé (footer) traz o preço e o botão de compra.
import type { ReactNode } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import { withBase } from "@/lib/paths";
import type { VipPreviewCard as Card } from "@/services/vip";

export function VipPreviewCard({ card, tag, footer }: { card: Card; tag?: string; footer?: ReactNode }) {
  const { t } = useChatI18n();
  const tiles = card.tiles.slice(0, 6);
  // mesmo card das ofertas do chat (moldura girando, selo, título, caixa de preço, botão com seta);
  // no lugar da foto do produto, o mosaico do grupo (o grátis à vista, o resto borrado com cadeado)
  return (
    <div className="msg-row bot">
      <div className="card-msg offer-card vipc">
        <div className="offer-media vipc-media">
          {tiles.length > 0 ? (
            <VipMosaic card={card} />
          ) : card.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="card-img" src={card.coverUrl} alt="" />
          ) : (
            <div className="card-img offer-placeholder" aria-hidden="true">
              <span>♛</span>
            </div>
          )}
          <span className="offer-seal">{tag ?? `🎁 ${t.vipTag}`}</span>
        </div>
        <div className="card-body offer-body">
          <div className="vipc-id">
            {card.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="vipc-avatar" src={card.avatarUrl} alt="" />
            ) : (
              <span className="vipc-avatar">{card.name.slice(0, 1)}</span>
            )}
            <div>
              <h3 className="offer-title">
                {card.name} <span className="vipc-ok">✓</span>
              </h3>
              <small>
                📷 {card.counts.images} {t.vipPhotos} · 🎬 {card.counts.videos} {t.vipVideos}
              </small>
            </div>
          </div>
          {card.headline && <p>{card.headline}</p>}
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

/** Comprou (qualquer produto) e o VIP é liberado para compradores: card com o botão para abrir o grupo já liberado. */
export function VipAccessCard({ name, avatarUrl, url }: { name: string; avatarUrl: string | null; url: string }) {
  const { t } = useChatI18n();
  return (
    <div className="msg-row bot">
      <div className="vipc vipc-access">
        <div className="vipc-access-top">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="vipc-avatar" src={avatarUrl} alt="" />
          ) : (
            <span className="vipc-avatar">{name.slice(0, 1)}</span>
          )}
          <div>
            <b>{t.vipAccessTitle}</b>
            <small>
              ♛ {name} · {t.vipAccessSub}
            </small>
          </div>
        </div>
        <a className="vipc-cta" href={withBase(url)} target="_blank" rel="noopener">
          {t.vipOpen} <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}

/** mosaico do grupo: o que é grátis aparece, o resto só com a prévia borrada e o cadeado */
export function VipMosaic({ card }: { card: Card }) {
  const tiles = card.tiles.slice(0, 6);
  if (!tiles.length) return null;
  return (
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
  );
}
