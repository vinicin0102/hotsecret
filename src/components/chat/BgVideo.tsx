// Vídeo de fundo da conversa: toca sozinho, sem som, em loop — sem o lead precisar dar play.
// O "autoplay" do HTML sozinho falha em alguns casos: a página vem do servidor sem o atributo
// "muted" (o navegador então bloqueia), iPhone no modo pouca bateria, e depois de bloquear a tela
// ou trocar de aba o vídeo fica parado. Aqui o vídeo é forçado a ficar mudo e volta a tocar sempre
// que pode: ao carregar, ao voltar para a aba e no primeiro toque/rolagem na tela.
import { useEffect, useRef } from "react";

export function BgVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.loop = true;

    const play = () => {
      if (document.hidden || !v.paused) return;
      void v.play().catch(() => undefined);
    };
    // aba escondida: pausa (economiza bateria e dados); voltou: toca de novo
    const onVisibility = () => (document.hidden ? v.pause() : play());
    // alguns celulares não repetem sozinhos: no fim, volta ao começo
    const onEnded = () => {
      v.currentTime = 0;
      play();
    };
    // o sistema pausou (ligação, outro app tocando, bloqueio de tela): tenta de novo em seguida
    const onPause = () => setTimeout(play, 400);
    const gestures = ["pointerdown", "touchstart", "keydown", "scroll", "wheel"] as const;

    play();
    v.addEventListener("loadeddata", play);
    v.addEventListener("canplay", play);
    v.addEventListener("ended", onEnded);
    v.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", play);
    for (const g of gestures) window.addEventListener(g, play, { capture: true, passive: true });
    return () => {
      v.removeEventListener("loadeddata", play);
      v.removeEventListener("canplay", play);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", play);
      for (const g of gestures) window.removeEventListener(g, play, { capture: true });
    };
  }, [src]);

  return (
    <video
      ref={ref}
      className="chat-bg-video"
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      controls={false}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
