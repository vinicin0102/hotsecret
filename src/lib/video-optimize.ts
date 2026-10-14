// Otimização de vídeo no navegador (painel), antes do upload: MP4 H.264 até 720p com o índice no início do arquivo
// ("fast start"), para o vídeo começar a tocar na hora e não travar no celular do lead.
// Roda com o codificador do próprio computador (WebCodecs); se o navegador não suportar, o arquivo original é enviado.

/** lado maior do vídeo otimizado (720p) */
const MAX_SIDE = 1280;
/** taxa de bits alvo do vídeo (boa qualidade em 720p, leve para 4G) */
const VIDEO_BPS = 2_000_000;
const AUDIO_BPS = 128_000;
/** vídeos já leves (H.264, até 720p, até ~3 Mbps) só são reorganizados, sem perder qualidade */
const LIGHT_BPS = 3_200_000;

export interface OptimizeResult {
  file: File;
  /** true quando o arquivo foi recodificado ou reorganizado */
  changed: boolean;
  /** por que não mudou: já leve, navegador sem suporte ou falha */
  reason?: "light" | "unsupported" | "failed";
}

/** MP4 com o índice (moov) antes dos dados (mdat): já começa a tocar sem baixar tudo */
async function moovFirst(file: Blob): Promise<boolean> {
  let pos = 0;
  for (let i = 0; i < 32 && pos + 8 <= file.size; i++) {
    const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
    let size = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (size === 1 && head.byteLength >= 16) size = Number(head.getBigUint64(8));
    if (size < 8) return false;
    pos += size;
  }
  return false;
}

const mp4Name = (name: string) => `${name.replace(/\.[^.]+$/, "") || "video"}.mp4`;

/**
 * Otimiza um vídeo para tocar sem travar. Nunca lança erro: se algo falhar, devolve o arquivo original.
 * onProgress recebe 0–100.
 */
export async function optimizeVideo(
  file: File,
  onProgress?: (pct: number) => void,
  /** só para testes automatizados: navegadores sem H.264 (Chromium de teste) usam VP9 */
  opts: { codec?: "avc" | "vp9" } = {},
): Promise<OptimizeResult> {
  const target = opts.codec ?? "avc";
  if (typeof window === "undefined" || !file.type.startsWith("video/")) return { file, changed: false, reason: "failed" };
  if (typeof VideoEncoder === "undefined") return { file, changed: false, reason: "unsupported" };
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return { file, changed: false, reason: "failed" };
    const duration = await input.computeDuration();
    const w = track.displayWidth;
    const h = track.displayHeight;
    const bps = duration > 0 ? (file.size * 8) / duration : Infinity;
    const codec = track.codec;
    const big = Math.max(w, h) > MAX_SIDE;
    const transcode = codec !== target || big || bps > LIGHT_BPS;
    if (transcode && !(await mb.canEncodeVideo(target))) return { file, changed: false, reason: "unsupported" };

    const audioTrack = await input.getPrimaryAudioTrack();
    // já é um MP4 leve com o índice no início: nada a fazer
    if (!transcode && (!audioTrack || audioTrack.codec === "aac") && /mp4|quicktime/.test(file.type) && (await moovFirst(file))) {
      return { file, changed: false, reason: "light" };
    }
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: transcode
        ? {
            codec: target,
            ...(big ? (h > w ? { height: MAX_SIDE } : { width: MAX_SIDE }) : {}),
            quality: new mb.Quality({ bitrate: VIDEO_BPS }),
            forceTranscode: true,
          }
        : {},
      audio:
        audioTrack && (audioTrack.codec !== "aac" || transcode)
          ? (await mb.canEncodeAudio("aac"))
            ? { codec: "aac", quality: new mb.Quality({ bitrate: AUDIO_BPS }) }
            : { discard: false }
          : {},
    });
    if (!conversion.isValid) return { file, changed: false, reason: "unsupported" };
    conversion.onProgress = (p) => onProgress?.(Math.min(99, Math.round(p * 100)));
    await conversion.execute();
    const buf = output.target.buffer;
    if (!buf || buf.byteLength < 1024) return { file, changed: false, reason: "failed" };
    // recodificou mas ficou maior que um MP4 original: fica o original
    if (transcode && buf.byteLength >= file.size && file.type === "video/mp4" && codec === target) return { file, changed: false, reason: "light" };
    onProgress?.(100);
    return { file: new File([buf], mp4Name(file.name), { type: "video/mp4" }), changed: true };
  } catch (e) {
    console.warn("[video] otimização falhou, enviando o original", e);
    return { file, changed: false, reason: "failed" };
  }
}

/** mensagem para o painel quando o vídeo não foi otimizado */
export function notOptimizedMessage(r: OptimizeResult | null): string {
  if (r?.reason === "unsupported") return "Seu navegador não consegue otimizar este vídeo — use o Google Chrome atualizado no computador.";
  if (r?.reason === "light") return "Este vídeo já está leve — nada a otimizar.";
  return "Não foi possível otimizar este vídeo (o original continua valendo).";
}

/** Baixa um vídeo já enviado (pelo link) e otimiza. */
export async function optimizeVideoUrl(url: string, onProgress?: (pct: number) => void): Promise<OptimizeResult | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível baixar o vídeo (${res.status})`);
  const blob = await res.blob();
  const name = decodeURIComponent(url.split("?")[0].split("/").pop() || "video.mp4");
  const file = new File([blob], name, { type: blob.type || "video/mp4" });
  return optimizeVideo(file, onProgress);
}
