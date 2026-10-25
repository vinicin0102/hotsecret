// Carrossel da vitrine: um card por modelo (foto, nome, online, o que ela faz, bio e destaques) com "Conversar comigo".
import { useEffect, useRef, useState } from "react";
import { initPixels } from "@/features/chat-engine/pixels";
import { withBase } from "@/lib/paths";
import type { PublicShowcase } from "@/services/showcase";

const TEXTS = {
  "pt-BR": { title: "Escolha com quem você quer conversar", talk: "Conversar comigo", online: "online agora", offline: "volta já", prev: "Anterior", next: "Próxima", draft: "Rascunho — só você está vendo. Publique a vitrine para o link funcionar.", empty: "Nenhuma modelo disponível no momento." },
  "es-MX": { title: "Elige con quién quieres hablar", talk: "Hablar conmigo", online: "en línea ahora", offline: "vuelve pronto", prev: "Anterior", next: "Siguiente", draft: "Borrador — solo tú lo ves. Publica la vitrina para que el enlace funcione.", empty: "No hay modelos disponibles por ahora." },
  "es-AR": { title: "Elegí con quién querés hablar", talk: "Hablar conmigo", online: "en línea ahora", offline: "vuelve pronto", prev: "Anterior", next: "Siguiente", draft: "Borrador — solo vos lo ves. Publicá la vitrina para que el enlace funcione.", empty: "No hay modelos disponibles por ahora." },
} as const;

/** leva junto as UTMs/parâmetros do anúncio que trouxeram o lead até a vitrine */
function chatLink(href: string, search: string): string {
  const [path, own = ""] = href.split("?");
  const params = new URLSearchParams(search);
  new URLSearchParams(own).forEach((v, k) => params.set(k, v));
  const q = params.toString();
  return withBase(q ? `${path}?${q}` : path);
}

export function ShowcaseCarousel({ showcase, draft }: { showcase: PublicShowcase; draft: boolean }) {
  const t = TEXTS[showcase.locale] ?? TEXTS["pt-BR"];
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // parâmetros do anúncio (só existem no navegador: o link é refeito depois de abrir a página)
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(window.location.search), []);
  const cards = showcase.cards;

  // pixels de anúncios (PageView); não carregam no rascunho
  useEffect(() => {
    if (!draft) initPixels(showcase.tracking);
  }, [draft, showcase.tracking]);

  // card em destaque = o mais centralizado no carrossel
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let dist = Infinity;
      Array.from(el.children).forEach((c, i) => {
        const card = c as HTMLElement;
        const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      setActive(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    const card = el?.children[Math.max(0, Math.min(cards.length - 1, i))] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: "smooth" });
  };

  return (
    <main className="sc-page">
      {draft && <div className="sc-draft">{t.draft}</div>}
      <header className="sc-head">
        <h1>{showcase.title || t.title}</h1>
        {showcase.subtitle && <p>{showcase.subtitle}</p>}
      </header>
      {cards.length === 0 ? (
        <p className="sc-empty">{t.empty}</p>
      ) : (
        <>
          <div className="sc-track" ref={track}>
            {cards.map((c, i) => (
              <article key={c.id} className={`sc-card ${i === active ? "active" : ""}`}>
                <div className="sc-photo" style={c.photoUrl ? { backgroundImage: `url(${c.photoUrl})` } : undefined}>
                  {!c.photoUrl && <span className="sc-initial">{c.name.slice(0, 1)}</span>}
                  <div className="sc-photo-info">
                    <h2>{c.name}</h2>
                    <span className={`sc-status ${c.online ? "on" : ""}`}>
                      <i /> {c.online ? t.online : t.offline}
                    </span>
                  </div>
                </div>
                <div className="sc-body">
                  {c.headline && <div className="sc-headline">{c.headline}</div>}
                  {c.bio && <p className="sc-bio">{c.bio}</p>}
                  {c.tags.length > 0 && (
                    <div className="sc-tags">
                      {c.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <a className="sc-cta" href={chatLink(c.href, search)}>
                    💬 {t.talk}
                  </a>
                </div>
              </article>
            ))}
          </div>
          {cards.length > 1 && (
            <nav className="sc-nav">
              <button className="sc-arrow" onClick={() => go(active - 1)} disabled={active === 0} aria-label={t.prev}>
                ‹
              </button>
              <div className="sc-dots">
                {cards.map((c, i) => (
                  <button key={c.id} className={i === active ? "on" : ""} onClick={() => go(i)} aria-label={c.name} />
                ))}
              </div>
              <button className="sc-arrow" onClick={() => go(active + 1)} disabled={active === cards.length - 1} aria-label={t.next}>
                ›
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}
