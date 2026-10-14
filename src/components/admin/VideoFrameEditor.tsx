// Enquadramento do vídeo na tela do celular do lead: prévias de celular comprido e curto, sincronizadas com o
// player do editor, mostrando exatamente o corte da chamada (e onde ficam o nome/tempo e os botões por cima).
import { useEffect, useRef } from "react";
import { DEFAULT_FRAME, type VideoFrame } from "@/types/video";

const PHONES = [
  { id: "tall", label: "Celular comprido (iPhone 12+, maioria dos Android)", ratio: 9 / 19.5 },
  { id: "short", label: "Celular curto (iPhone SE / 8)", ratio: 9 / 16 },
] as const;
const PHONE_H = 330;

export function VideoFrameEditor({
  url,
  posterUrl,
  now,
  playing,
  frame,
  onChange,
}: {
  url: string;
  posterUrl?: string | null;
  /** posição atual do player do editor (ms) */
  now: number;
  playing: boolean;
  frame: VideoFrame | undefined;
  onChange: (frame: VideoFrame) => void;
}) {
  const f = frame ?? DEFAULT_FRAME;
  const vids = useRef<(HTMLVideoElement | null)[]>([]);
  const drag = useRef<{ x0: number; y0: number; fx: number; fy: number; el: HTMLElement } | null>(null);

  // acompanha o player do editor (tempo e play/pause)
  useEffect(() => {
    for (const v of vids.current) {
      if (!v) continue;
      if (Math.abs(v.currentTime * 1000 - now) > (playing ? 400 : 40)) v.currentTime = now / 1000;
      if (playing && v.paused) void v.play().catch(() => undefined);
      if (!playing && !v.paused) v.pause();
    }
  }, [now, playing]);

  const set = (patch: Partial<VideoFrame>) => onChange({ ...f, ...patch });

  // arrastar a imagem dentro do celular muda o ponto de foco (só quando preenche a tela)
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (f.fit !== "cover") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, y0: e.clientY, fx: f.x, fy: f.y, el: e.currentTarget };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const v = vids.current.find(Boolean);
    if (!d || !v || !v.videoWidth) return;
    const fw = d.el.clientWidth;
    const fh = d.el.clientHeight;
    const scale = Math.max(fw / v.videoWidth, fh / v.videoHeight);
    const overX = v.videoWidth * scale - fw;
    const overY = v.videoHeight * scale - fh;
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    set({
      x: overX > 1 ? clamp(d.fx - ((e.clientX - d.x0) / overX) * 100) : f.x,
      y: overY > 1 ? clamp(d.fy - ((e.clientY - d.y0) / overY) * 100) : f.y,
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div className="vf">
      <div className="vf-phones">
        {PHONES.map((p, i) => (
          <figure key={p.id} className="vf-phone-wrap">
            <div
              className={`vf-phone ${f.fit === "cover" ? "draggable" : ""}`}
              style={{ height: PHONE_H, width: Math.round(PHONE_H * p.ratio) }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <video
                ref={(el) => {
                  vids.current[i] = el;
                }}
                src={url}
                poster={posterUrl || undefined}
                muted
                playsInline
                preload="auto"
                style={{ objectFit: f.fit, objectPosition: `${f.x}% ${f.y}%` }}
              />
              <div className="vf-ui top">nome · 00:12</div>
              <div className="vf-ui bottom">botões da chamada</div>
            </div>
            <figcaption>{p.label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="vf-controls">
        <div className="segmented">
          <button type="button" className={f.fit === "cover" ? "active" : ""} onClick={() => set({ fit: "cover" })}>
            Preencher a tela
          </button>
          <button type="button" className={f.fit === "contain" ? "active" : ""} onClick={() => set({ fit: "contain" })}>
            Mostrar inteiro
          </button>
        </div>
        {f.fit === "cover" ? (
          <>
            <label className="vf-slider">
              <span>↔ Horizontal</span>
              <input type="range" min={0} max={100} value={f.x} onChange={(e) => set({ x: Number(e.target.value) })} />
            </label>
            <label className="vf-slider">
              <span>↕ Vertical</span>
              <input type="range" min={0} max={100} value={f.y} onChange={(e) => set({ y: Number(e.target.value) })} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ x: 50, y: 50 })}>
              Centralizar
            </button>
            <p className="hint">
              O vídeo ocupa a tela inteira e as bordas que não cabem são cortadas. <b>Arraste a imagem</b> dentro do celular (ou use as barras) para
              escolher a parte que aparece. As faixas escuras mostram onde ficam o nome/tempo e os botões da chamada.
            </p>
          </>
        ) : (
          <p className="hint">O vídeo aparece inteiro, sem cortes; o que sobrar da tela fica preto (faixas em cima/embaixo ou nos lados).</p>
        )}
      </div>
    </div>
  );
}
