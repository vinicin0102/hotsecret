import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/format";
import type { OfferContent, PublicProduct, TarotCard } from "@/types/flow";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * Oferta de tarot (Cérebro): cartas viradas → o lead toca e vê o preço →
 * depois do PIX aprovado as cartas viram uma a uma com a leitura.
 */
export function TarotOffer({
  offer,
  product,
  bought,
  onCta,
  loadCards,
}: {
  offer: OfferContent;
  product: PublicProduct | undefined;
  bought: boolean;
  onCta: () => void;
  /** cartas reveladas (o servidor só devolve depois do pagamento aprovado) */
  loadCards: () => Promise<TarotCard[] | null>;
}) {
  const slots = offer.tarotCards?.length ? offer.tarotCards : [{ id: "1" }, { id: "2" }, { id: "3" }];
  const [picked, setPicked] = useState<number | null>(null);
  const [cards, setCards] = useState<TarotCard[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useRef(loadCards);
  load.current = loadCards;

  useEffect(() => {
    if (!bought || cards) return;
    let alive = true;
    void (async () => {
      // o pagamento pode levar alguns segundos para constar no servidor
      for (let i = 0; i < 6 && alive; i++) {
        const r = await load.current().catch(() => null);
        if (r?.length) {
          if (!alive) return;
          setCards(r);
          return;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      if (alive) setFailed(true);
    })();
    return () => {
      alive = false;
    };
  }, [bought, cards]);

  // as cartas viram logo depois de chegar (uma a uma, pelo atraso de cada carta no CSS)
  useEffect(() => {
    if (!cards) return;
    const t = setTimeout(() => setFlipped(true), 250);
    return () => clearTimeout(t);
  }, [cards]);

  if (!product) return <div className="bubble system">Oferta indisponível no momento.</div>;
  const shown = cards ?? slots;

  return (
    <div className="msg-row bot">
      <div className={`tarot ${flipped ? "is-revealed" : ""}`}>
        <div className="tarot-title">{offer.headline || product.name}</div>
        <div className="tarot-cards">
          {shown.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`tarot-card ${flipped ? "flipped" : ""} ${picked === i && !bought ? "picked" : ""}`}
              style={{ ["--i" as string]: i }}
              onClick={() => !bought && setPicked(i)}
              aria-label={flipped ? c.name || c.label || `Carta ${i + 1}` : `Carta ${i + 1} virada`}
            >
              <span className="tarot-inner">
                <span className="tarot-face tarot-back">
                  {offer.tarotBackUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={offer.tarotBackUrl} alt="" />
                  ) : (
                    <span className="tarot-back-art">
                      <span>☾</span>
                      <b>✦</b>
                      <span>☽</span>
                    </span>
                  )}
                </span>
                <span className="tarot-face tarot-front">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt={c.name || ""} />
                  ) : (
                    <span className="tarot-front-art">
                      <small>{ROMAN[i]}</small>
                      <b>{c.name || "✦"}</b>
                    </span>
                  )}
                </span>
              </span>
              {c.label && <span className="tarot-label">{c.label}</span>}
            </button>
          ))}
        </div>

        {!bought && picked === null && <div className="tarot-hint">Toque em uma carta para descobrir ✨</div>}

        {!bought && picked !== null && (
          <div className="tarot-buy">
            {product.description && <p>{product.description}</p>}
            {product.originalPrice && product.originalPrice > product.price ? (
              <div className="price-old">De {formatBRL(product.originalPrice)}</div>
            ) : null}
            <div className="price">
              {formatBRL(product.price)} <small>pagamento único</small>
            </div>
            <button className="btn btn-primary cta-glow" onClick={onCta}>
              {offer.ctaLabel || "REVELAR MINHAS CARTAS 🔮"}
            </button>
            <div className="secure-note">🔒 Pagamento seguro via PIX · sem cadastro</div>
          </div>
        )}

        {bought && !cards && <div className="tarot-hint">{failed ? "Não consegui abrir suas cartas agora. Recarregue a página." : "Revelando suas cartas…"}</div>}

        {cards && (
          <div className={`tarot-reading ${flipped ? "show" : ""}`}>
            {cards.map((c, i) => (
              <div key={c.id} className="tarot-read" style={{ ["--i" as string]: i }}>
                <div className="tarot-read-head">
                  <span>{ROMAN[i]}</span>
                  {c.label && <em>{c.label}</em>}
                  {c.name && <b>{c.name}</b>}
                </div>
                {c.meaning && <p>{c.meaning}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
