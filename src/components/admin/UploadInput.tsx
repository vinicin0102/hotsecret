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
  const [err, setErr] = useState<string | null>(null);
  const isImage = accept.startsWith("image");

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      onChange(await uploadFile(file));
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
        {isImage && value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="preview" src={value} alt="" />
        )}
        <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-sm" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? "Enviando..." : "Upload"}
        </button>
        <input ref={ref} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {err && <div className="error-text">{err}</div>}
    </div>
  );
}
