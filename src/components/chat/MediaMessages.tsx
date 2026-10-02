import { useEffect, useRef, useState } from "react";

export function ImageMessage({ url, caption }: { url: string; caption?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={caption || "imagem"} loading="lazy" />
      {caption && <div className="caption">{caption}</div>}
    </>
  );
}

/** Vídeo sem barra de controles: apenas o botão de play (toque pausa/retoma). */
export function VideoMessage({
  url,
  thumbnailUrl,
  caption,
  autoplay,
  onPlay,
}: {
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  autoplay?: boolean;
  onPlay?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(!!autoplay);
  const tracked = useRef(false);

  const markPlayed = () => {
    if (!tracked.current) {
      tracked.current = true;
      onPlay?.();
    }
  };

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    // autoplay começa mudo: o primeiro toque liga o som em vez de pausar
    if (muted && !v.paused) {
      v.muted = false;
      setMuted(false);
      return;
    }
    if (v.paused) {
      v.muted = false;
      setMuted(false);
      void v.play();
    } else {
      v.pause();
    }
  };

  return (
    <>
      <div className={`video-msg ${playing ? "is-playing" : ""}`} onClick={toggle} onContextMenu={(e) => e.preventDefault()}>
        <video
          ref={ref}
          src={url}
          poster={thumbnailUrl || undefined}
          playsInline
          preload="metadata"
          autoPlay={autoplay}
          muted={muted}
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          onPlay={() => {
            setPlaying(true);
            markPlayed();
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
        {!playing && (
          <button type="button" className="video-play" aria-label="Reproduzir vídeo">
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
            </svg>
          </button>
        )}
      </div>
      {caption && <div className="caption">{caption}</div>}
    </>
  );
}

const BARS = [6, 12, 18, 9, 22, 14, 26, 10, 16, 24, 8, 20, 13, 27, 11, 17, 7, 21, 15, 9, 19, 12, 23, 8];

export function AudioMessage({ url, durationSec, caption, onPlay }: { url: string; durationSec?: number; caption?: string; onPlay?: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const played = useRef(false);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onMeta = () => Number.isFinite(a.duration) && setDuration(Math.round(a.duration));
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      void a.play();
      setPlaying(true);
      if (!played.current) {
        played.current = true;
        onPlay?.();
      }
    } else {
      a.pause();
      setPlaying(false);
    }
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <>
      <div className="audio-msg">
        <button onClick={toggle} aria-label={playing ? "Pausar" : "Ouvir"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="wave">
          {BARS.map((h, i) => (
            <i key={i} style={{ height: h }} className={i / BARS.length < progress ? "on" : ""} />
          ))}
        </div>
        <span className="dur">{fmt(duration)}</span>
        <audio ref={audio} src={url} preload="metadata" />
      </div>
      {caption && <div style={{ marginTop: 6 }}>{caption}</div>}
    </>
  );
}
