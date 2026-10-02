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
  const played = useRef(false);
  return (
    <>
      <video
        src={url}
        poster={thumbnailUrl || undefined}
        controls
        playsInline
        preload="metadata"
        autoPlay={autoplay}
        muted={autoplay}
        onPlay={() => {
          if (!played.current) {
            played.current = true;
            onPlay?.();
          }
        }}
      />
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
