// Editor do vídeo da chamada: trilhas FREE (loop antes de pagar), VIP (depois de pagar, com upsells) e CHAT (falas).
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatBRL } from "@/lib/format";
import { shortId } from "@/features/chat-engine/engine";
import { formatMs, normalizeTimeline, type VideoTimeline } from "@/types/video";
import { UpsellScreenEditor } from "@/components/admin/UpsellScreenEditor";

interface VideoData {
  id: string;
  name: string;
  url: string;
  posterUrl: string | null;
  durationMs: number;
  timeline: VideoTimeline;
}
interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
}
type Sel = { kind: "free" } | { kind: "vip" } | { kind: "chat"; id: string } | { kind: "marker"; id: string } | null;
type Drag =
  | { what: "playhead" }
  | { what: "range"; track: "free" | "vip"; edge: "start" | "end" | "move"; grabMs: number; orig: { start: number; end: number } }
  | { what: "chat"; id: string; edge: "start" | "end" | "move"; grabMs: number; orig: { start: number; end: number } }
  | { what: "marker"; id: string };

const LABEL_W = 72;
const STEPS = [500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000];
const fmtTick = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const secInput = (ms: number) => (ms / 1000).toFixed(3);

export default function VideoEditorPage() {
  const router = useRouter();
  const id = String(router.query.id ?? "");
  const { data } = useFetch<{ video: VideoData }>(id ? `/api/admin/videos/${id}` : null);
  const { data: prod } = useFetch<{ products: Product[] }>("/api/admin/products");
  const products = prod?.products ?? [];

  const [video, setVideo] = useState<VideoData | null>(null);
  const [tl, setTl] = useState<VideoTimeline | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [sel, setSel] = useState<Sel>(null);
  const [zoom, setZoom] = useState(1);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [laneBase, setLaneBase] = useState(800);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const vRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    if (!data?.video || video) return;
    setVideo(data.video);
    setTl(data.video.timeline);
    setSavedJson(JSON.stringify({ name: data.video.name, timeline: data.video.timeline, durationMs: data.video.durationMs }));
  }, [data, video]);

  const duration = video?.durationMs || 1;
  const laneW = laneBase * zoom;
  const msToX = useCallback((ms: number) => (ms / duration) * laneW, [duration, laneW]);
  const dirty = !!video && !!tl && JSON.stringify({ name: video.name, timeline: tl, durationMs: video.durationMs }) !== savedJson;

  // largura disponível para a linha do tempo
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLaneBase(Math.max(300, el.clientWidth - LABEL_W - 16)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tl === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // posição do vídeo em tempo real
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = vRef.current;
      if (v) setNow(Math.round(v.currentTime * 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = useCallback(
    (ms: number) => {
      const v = vRef.current;
      const t = Math.max(0, Math.min(duration, ms));
      if (v) v.currentTime = t / 1000;
      setNow(t);
    },
    [duration],
  );
  const togglePlay = useCallback(() => {
    const v = vRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  // atalhos: espaço = play/pause, ← → = 1s (Shift = 5s)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        seek(now + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 5000 : 1000));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seek, now]);

  // Ctrl + rolagem = zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(40, z * (e.deltaY < 0 ? 1.25 : 0.8))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [tl === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const msAt = (clientX: number, snap: boolean) => {
    const rect = laneRef.current!.getBoundingClientRect();
    let ms = ((clientX - rect.left) / laneW) * duration;
    ms = Math.max(0, Math.min(duration, ms));
    return Math.round(snap ? Math.round(ms / 500) * 500 : ms);
  };

  const startDrag = (e: RPointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = d;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !tl) return;
      const ms = msAt(e.clientX, e.shiftKey);
      if (d.what === "playhead") return seek(ms);
      if (d.what === "marker") {
        setTl((t) => (t ? { ...t, markers: t.markers.map((m) => (m.id === d.id ? { ...m, at: ms } : m)) } : t));
        return;
      }
      const apply = (o: { start: number; end: number }) => {
        if (d.edge === "start") return { start: Math.min(ms, o.end - 100), end: o.end };
        if (d.edge === "end") return { start: o.start, end: Math.max(ms, o.start + 100) };
        const len = o.end - o.start;
        const start = Math.max(0, Math.min(duration - len, o.start + (ms - d.grabMs)));
        return { start, end: start + len };
      };
      if (d.what === "range") setTl((t) => (t ? { ...t, [d.track]: apply(d.orig) } : t));
      else setTl((t) => (t ? { ...t, chat: t.chat.map((c) => (c.id === d.id ? { ...c, ...apply(d.orig) } : c)) } : t));
    };
    const up = () => {
      if (drag.current && drag.current.what !== "playhead") setTl((t) => (t ? normalizeTimeline(t, duration) : t));
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }); // usa sempre os valores atuais

  const ticks = useMemo(() => {
    const step = STEPS.find((s) => (s / duration) * laneW >= 90) ?? STEPS[STEPS.length - 1];
    const out: { ms: number; major: boolean }[] = [];
    for (let ms = 0; ms <= duration; ms += step / 4) out.push({ ms, major: Math.round(ms) % step === 0 });
    return out;
  }, [duration, laneW]);

  const onMeta = () => {
    const v = vRef.current;
    if (!v || !video || !Number.isFinite(v.duration)) return;
    const d = Math.round(v.duration * 1000);
    if (Math.abs(d - video.durationMs) > 50) {
      setVideo({ ...video, durationMs: d });
      setTl((t) => normalizeTimeline(video.durationMs ? t : null, d));
    }
  };

  const save = async () => {
    if (!video || !tl) return;
    setSaving(true);
    setMsg(null);
    try {
      await api(`/api/admin/videos/${video.id}`, {
        method: "PUT",
        body: { name: video.name, url: video.url, posterUrl: video.posterUrl, durationMs: video.durationMs, timeline: tl },
      });
      setSavedJson(JSON.stringify({ name: video.name, timeline: tl, durationMs: video.durationMs }));
      setMsg({ text: "Salvo ✓" });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro ao salvar", error: true });
    } finally {
      setSaving(false);
    }
  };

  const addChat = () => {
    if (!tl) return;
    const start = Math.min(now, Math.max(0, duration - 1000));
    const c = { id: shortId("fc"), start, end: Math.min(duration, start + 8000), text: "" };
    setTl({ ...tl, chat: [...tl.chat, c] });
    setSel({ kind: "chat", id: c.id });
  };
  const addMarker = () => {
    if (!tl) return;
    const at = Math.max(tl.vip.start, Math.min(tl.vip.end, now));
    const m = { id: shortId("up"), at, label: "Upsell", productId: products.find((p) => p.active)?.id ?? "", text: "", ctaLabel: "", pause: true };
    setTl({ ...tl, markers: [...tl.markers, m] });
    setSel({ kind: "marker", id: m.id });
    seek(at);
  };

  if (!video || !tl) {
    return (
      <AdminLayout title="Vídeo">
        <div className="card">Carregando...</div>
      </AdminLayout>
    );
  }

  const selChat = sel?.kind === "chat" ? tl.chat.find((c) => c.id === sel.id) : undefined;
  const selMarker = sel?.kind === "marker" ? tl.markers.find((m) => m.id === sel.id) : undefined;
  const setChat = (patch: Partial<VideoTimeline["chat"][number]>) =>
    selChat && setTl({ ...tl, chat: tl.chat.map((c) => (c.id === selChat.id ? { ...c, ...patch } : c)) });
  const setMarker = (patch: Partial<VideoTimeline["markers"][number]>) =>
    selMarker && setTl({ ...tl, markers: tl.markers.map((m) => (m.id === selMarker.id ? { ...m, ...patch } : m)) });
  const activeChat = tl.chat.filter((c) => now >= c.start && now < c.end);

  const rangeBox = (track: "free" | "vip", label: string) => {
    const r = tl[track];
    return (
      <div
        className={`ve-range ve-${track} ${sel?.kind === track ? "selected" : ""}`}
        style={{ left: msToX(r.start), width: Math.max(6, msToX(r.end) - msToX(r.start)) }}
        onPointerDown={(e) => {
          setSel({ kind: track });
          startDrag(e, { what: "range", track, edge: "move", grabMs: msAt(e.clientX, false), orig: { ...r } });
        }}
      >
        <span className="ve-handle l" onPointerDown={(e) => startDrag(e, { what: "range", track, edge: "start", grabMs: 0, orig: { ...r } })} />
        <span className="ve-range-label">{label}</span>
        <span className="ve-handle r" onPointerDown={(e) => startDrag(e, { what: "range", track, edge: "end", grabMs: 0, orig: { ...r } })} />
      </div>
    );
  };

  return (
    <AdminLayout
      title={video.name}
      subtitle="Configurações usadas por todas as chamadas que usam este vídeo"
      actions={
        <div className="row">
          <Link className="btn btn-ghost btn-sm" href="/admin/videos">
            ← Vídeos
          </Link>
          {msg && <span className={msg.error ? "error-text" : "hint"}>{msg.text}</span>}
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
            ✓ {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      }
    >
      <div className="ve card">
        <div className="ve-player" onClick={togglePlay}>
          <video
            ref={vRef}
            src={video.url}
            poster={video.posterUrl || undefined}
            playsInline
            preload="auto"
            onLoadedMetadata={onMeta}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          {!playing && (
            <button type="button" className="ve-bigplay" aria-label="Reproduzir">
              ▶
            </button>
          )}
          {activeChat.length > 0 && (
            <div className="ve-chat-preview">
              {activeChat.map((c) => (
                <div key={c.id} className="ve-chat-bubble">
                  {c.text || <i>(fala vazia)</i>}
                </div>
              ))}
            </div>
          )}
          <div className={`ve-zone ${now >= tl.free.start && now <= tl.free.end ? "free" : now >= tl.vip.start && now <= tl.vip.end ? "vip" : ""}`}>
            {now >= tl.free.start && now <= tl.free.end ? "FREE" : now >= tl.vip.start && now <= tl.vip.end ? "VIP" : "fora dos trechos"}
          </div>
        </div>

        <div className="ve-controls">
          <button title="Início" onClick={() => seek(0)}>
            ⏮
          </button>
          <button title="Voltar 5s" onClick={() => seek(now - 5000)}>
            −5s
          </button>
          <button className="ve-play" title="Play/Pause (espaço)" onClick={togglePlay}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button title="Avançar 5s" onClick={() => seek(now + 5000)}>
            +5s
          </button>
          <button title="Fim" onClick={() => seek(duration)}>
            ⏭
          </button>
          <span className="ve-time">
            <b>{formatMs(now)}</b> / {formatMs(duration)}
          </span>
          <input
            className="ve-scrub"
            type="range"
            min={0}
            max={duration}
            value={Math.min(now, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Posição do vídeo"
          />
          <button title="Menos zoom" onClick={() => setZoom((z) => Math.max(1, z * 0.8))}>
            −
          </button>
          <button title="Zoom normal" className="ve-zoom" onClick={() => setZoom(1)}>
            {zoom < 10 ? zoom.toFixed(1).replace(".0", "") : Math.round(zoom)}×
          </button>
          <button title="Mais zoom" onClick={() => setZoom((z) => Math.min(40, z * 1.25))}>
            +
          </button>
        </div>

        <div className="ve-timeline" ref={scrollRef}>
          <div className="ve-inner" style={{ width: LABEL_W + laneW + 16 }}>
            <div className="ve-row ve-ruler-row">
              <div className="ve-label" />
              <div
                className="ve-lane ve-ruler"
                ref={laneRef}
                style={{ width: laneW }}
                onPointerDown={(e) => {
                  seek(msAt(e.clientX, e.shiftKey));
                  startDrag(e, { what: "playhead" });
                }}
              >
                {ticks.map((t) => (
                  <div key={t.ms} className={`ve-tick ${t.major ? "major" : ""}`} style={{ left: msToX(t.ms) }}>
                    {t.major && <span>{fmtTick(t.ms)}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="ve-row">
              <div className="ve-label free">FREE</div>
              <div className="ve-lane" style={{ width: laneW }} onPointerDown={(e) => seek(msAt(e.clientX, e.shiftKey))}>
                {rangeBox("free", "LOOP FREE")}
              </div>
            </div>
            <div className="ve-row">
              <div className="ve-label vip">VIP</div>
              <div className="ve-lane" style={{ width: laneW }} onPointerDown={(e) => seek(msAt(e.clientX, e.shiftKey))}>
                {rangeBox("vip", "LOOP VIP")}
                {tl.markers.map((m) => (
                  <div
                    key={m.id}
                    className={`ve-marker ${sel?.kind === "marker" && sel.id === m.id ? "selected" : ""}`}
                    style={{ left: msToX(m.at) }}
                    title={`${m.label} · ${formatMs(m.at)}`}
                    onPointerDown={(e) => {
                      setSel({ kind: "marker", id: m.id });
                      seek(m.at);
                      startDrag(e, { what: "marker", id: m.id });
                    }}
                  >
                    <span className="ve-pin" />
                    <span className="ve-marker-label">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="ve-row">
              <div className="ve-label chat">CHAT</div>
              <div className="ve-lane" style={{ width: laneW }} onPointerDown={(e) => seek(msAt(e.clientX, e.shiftKey))}>
                {tl.chat.map((c) => (
                  <div
                    key={c.id}
                    className={`ve-range ve-chat ${sel?.kind === "chat" && sel.id === c.id ? "selected" : ""}`}
                    style={{ left: msToX(c.start), width: Math.max(6, msToX(c.end) - msToX(c.start)) }}
                    title={c.text}
                    onPointerDown={(e) => {
                      setSel({ kind: "chat", id: c.id });
                      startDrag(e, { what: "chat", id: c.id, edge: "move", grabMs: msAt(e.clientX, false), orig: { start: c.start, end: c.end } });
                    }}
                  >
                    <span className="ve-handle l" onPointerDown={(e) => startDrag(e, { what: "chat", id: c.id, edge: "start", grabMs: 0, orig: { start: c.start, end: c.end } })} />
                    <span className="ve-range-label">{c.text || "fala"}</span>
                    <span className="ve-handle r" onPointerDown={(e) => startDrag(e, { what: "chat", id: c.id, edge: "end", grabMs: 0, orig: { start: c.start, end: c.end } })} />
                  </div>
                ))}
              </div>
            </div>
            <div className="ve-playhead" style={{ left: LABEL_W + msToX(now) }} onPointerDown={(e) => startDrag(e, { what: "playhead" })} />
          </div>
        </div>

        <div className="ve-footer">
          <button className="btn btn-sm ve-add-chat" onClick={addChat}>
            + Fala Chat / IA
          </button>
          <button className="btn btn-sm ve-add-upsell" onClick={addMarker}>
            + Upsell no VIP
          </button>
          <span className="hint">Shift+arrastar = encaixa em 0,5s · Ctrl+rolar = zoom · espaço = play</span>
          <span className="ve-summary">
            <b className="free">FREE</b> {formatMs(tl.free.start)} → {formatMs(tl.free.end)} <b className="vip">VIP</b> {formatMs(tl.vip.start)} →{" "}
            {formatMs(tl.vip.end)} <b className="chat">CHAT</b> {tl.chat.length} trecho{tl.chat.length === 1 ? "" : "s"} <b className="up">UPSELL</b>{" "}
            {tl.markers.length}
          </span>
        </div>
      </div>

      <div className="card ve-inspector">
        {!sel && (
          <p className="hint">
            Clique num trecho ou marcador para editar. <b>FREE</b>: o que o lead vê em loop enquanto não paga (aparece junto com o PIX da chamada).{" "}
            <b>VIP</b>: o que toca depois do pagamento (no fim volta para o início do VIP). <b>CHAT</b>: falas que aparecem na tela durante o
            vídeo. <b>Upsells</b>: ofertas que surgem no momento exato do VIP.
          </p>
        )}
        {(sel?.kind === "free" || sel?.kind === "vip") && (
          <>
            <h3>{sel.kind === "free" ? "Trecho FREE (antes de pagar, em loop)" : "Trecho VIP (depois de pagar)"}</h3>
            <div className="grid-2">
              {(["start", "end"] as const).map((k) => (
                <div className="field" key={k}>
                  <label>{k === "start" ? "Início (segundos)" : "Fim (segundos)"}</label>
                  <input
                    className="input"
                    type="number"
                    step="0.001"
                    value={secInput(tl[sel.kind][k])}
                    onChange={(e) => setTl(normalizeTimeline({ ...tl, [sel.kind]: { ...tl[sel.kind], [k]: Math.round(Number(e.target.value) * 1000) } }, duration))}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        {selChat && (
          <>
            <div className="card-head">
              <h3>Fala no chat</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => (setTl({ ...tl, chat: tl.chat.filter((c) => c.id !== selChat.id) }), setSel(null))}>
                Excluir
              </button>
            </div>
            <div className="field">
              <label htmlFor="ve-chat-text">Mensagem que aparece na tela</label>
              <textarea id="ve-chat-text" className="textarea" rows={2} value={selChat.text} placeholder="Ex.: tá gostando? 😏" onChange={(e) => setChat({ text: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Aparece em (s)</label>
                <input className="input" type="number" step="0.001" value={secInput(selChat.start)} onChange={(e) => setChat({ start: Math.round(Number(e.target.value) * 1000) })} />
              </div>
              <div className="field">
                <label>Some em (s)</label>
                <input className="input" type="number" step="0.001" value={secInput(selChat.end)} onChange={(e) => setChat({ end: Math.round(Number(e.target.value) * 1000) })} />
              </div>
            </div>
          </>
        )}
        {selMarker && (
          <>
            <div className="card-head">
              <h3>Upsell em {formatMs(selMarker.at)}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => (setTl({ ...tl, markers: tl.markers.filter((m) => m.id !== selMarker.id) }), setSel(null))}>
                Excluir
              </button>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ve-m-label">Nome no marcador</label>
                <input id="ve-m-label" className="input" value={selMarker.label} onChange={(e) => setMarker({ label: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ve-m-prod">Produto</label>
                <select id="ve-m-prod" className="select" value={selMarker.productId} onChange={(e) => setMarker({ productId: e.target.value })}>
                  <option value="">— selecione —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatBRL(p.price)} {p.active ? "" : "(inativo)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ve-m-text">Texto da oferta na tela</label>
              <input id="ve-m-text" className="input" placeholder="Ex.: quer que eu continue só pra você? 🔥" value={selMarker.text ?? ""} onChange={(e) => setMarker({ text: e.target.value })} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ve-m-cta">Texto do botão</label>
                <input id="ve-m-cta" className="input" placeholder="DESBLOQUEAR" value={selMarker.ctaLabel ?? ""} onChange={(e) => setMarker({ ctaLabel: e.target.value })} />
              </div>
              <div className="field">
                <label>Momento (s)</label>
                <input className="input" type="number" step="0.001" value={secInput(selMarker.at)} onChange={(e) => setMarker({ at: Math.round(Number(e.target.value) * 1000) })} />
              </div>
            </div>
            <div className="field">
              <label>Como aparece</label>
              <div className="segmented">
                {(
                  [
                    ["card", "Card embaixo"],
                    ["screen", "Tela cheia (aviso → bloqueado → PIX)"],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" className={(selMarker.style ?? "card") === v ? "active" : ""} onClick={() => setMarker({ style: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {selMarker.style === "screen" ? (
              <>
                <p className="hint" style={{ marginTop: -4 }}>
                  O vídeo para e fica borrado atrás de um aviso. O botão abre o card bloqueado com o preço; pagar abre a folha com o PIX (CLABE no
                  México). Pagou, a chamada continua sozinha.
                </p>
                <UpsellScreenEditor value={selMarker.screen} onChange={(screen) => setMarker({ screen })} />
              </>
            ) : (
              <label className="checkbox">
                <input type="checkbox" checked={!!selMarker.pause} onChange={(e) => setMarker({ pause: e.target.checked })} />
                Pausar o vídeo até o lead comprar ou recusar
              </label>
            )}
            {(selMarker.at < tl.vip.start || selMarker.at > tl.vip.end) && <p className="error-text">Este marcador está fora do trecho VIP e não vai aparecer.</p>}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
