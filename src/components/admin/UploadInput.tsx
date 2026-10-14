import { useRef, useState } from "react";
import { uploadFile } from "@/lib/client";

/** Campo de URL com botão de upload (imagem, vídeo ou áudio). */
export function UploadInput({
  value,
  onChange,
  accept = "image/*",
  placeholder = "https://... ou envie um arquivo",
}: {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [stage, setStage] = useState<"optimizing" | "uploading" | undefined>();
  const [done, setDone] = useState<string | null>(null);
  const progress = (p: number, s?: "optimizing" | "uploading") => {
    setPct(p);
    setStage(s);
  };
  const isVideoUrl = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(value) && accept.includes("video");
  /** vídeo já enviado: baixa, otimiza e envia de novo (troca o link) */
  const optimizeExisting = async () => {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const { optimizeVideoUrl, notOptimizedMessage } = await import("@/lib/video-optimize");
      progress(0, "optimizing");
      const r = await optimizeVideoUrl(value, (p) => progress(p, "optimizing"));
      if (!r?.changed) {
        setDone(notOptimizedMessage(r));
        return;
      }
      onChange(await uploadFile(r.file, progress, { optimize: false }));
      setDone("Vídeo otimizado ✓ — salve para aplicar.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao otimizar");
    } finally {
      setBusy(false);
    }
  };
  const [err, setErr] = useState<string | null>(null);
  const isImage = accept.startsWith("image");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      setPct(null);
      setDone(null);
      onChange(await uploadFile(file, progress));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div>
      <div className="upload-field">
        {isImage && value && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(value) ? (
          <video className="preview" src={value} muted playsInline preload="metadata" />
        ) : isImage && value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="preview" src={value} alt="" />
        ) : null}
        <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? (stage === "optimizing" ? `Otimizando ${pct ?? 0}%` : pct != null ? `${pct}%` : "Enviando...") : "Upload"}
        </button>
        {isVideoUrl && !busy && (
          <button type="button" className="btn btn-sm btn-ghost" title="Deixa o vídeo leve (720p) para tocar sem travar" onClick={() => void optimizeExisting()}>
            ⚡ Otimizar
          </button>
        )}
        <input ref={ref} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {err && <div className="error-text">{err}</div>}
      {done && <div className="hint">{done}</div>}
    </div>
  );
}
