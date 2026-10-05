// Vídeos das chamadas: lista e envio. O editor fica em /admin/videos/[id].
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useFetch } from "@/hooks/useFetch";
import { api, uploadFile } from "@/lib/client";
import { formatMs } from "@/types/video";

interface VideoRow {
  id: string;
  name: string;
  url: string;
  posterUrl: string | null;
  durationMs: number;
  timeline: { markers?: unknown[]; chat?: unknown[] };
}

/** Lê a duração do vídeo no navegador. */
function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0);
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

export default function VideosPage() {
  const router = useRouter();
  const { data, reload } = useFetch<{ videos: VideoRow[] }>("/api/admin/videos");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");

  const create = async (name: string, url: string) => {
    setBusy("Lendo o vídeo...");
    const durationMs = await readDuration(url);
    const r = await api<{ video: { id: string } }>("/api/admin/videos", { body: { name, url, durationMs } });
    void router.push(`/admin/videos/${r.video.id}`);
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setError(null);
    try {
      const label = `Enviando ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`;
      setBusy(`${label}...`);
      const url = await uploadFile(f, (pct) => setBusy(`${label}... ${pct}%`));
      await create(f.name, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio");
      setBusy(null);
    }
  };
  const remove = async (v: VideoRow) => {
    if (!confirm(`Excluir ${v.name}? As ofertas de chamada que usam este vídeo ficam sem vídeo.`)) return;
    await api(`/api/admin/videos/${v.id}`, { method: "DELETE" });
    void reload();
  };

  return (
    <AdminLayout
      title="Vídeos"
      subtitle="Vídeos das chamadas: trecho FREE (antes de pagar), VIP (depois), falas no chat e upsells em momentos exatos"
      actions={
        <button className="btn btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          + Enviar vídeo
        </button>
      }
    >
      <input ref={fileRef} type="file" accept="video/mp4,video/webm" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <input className="input" placeholder="Ou cole o link de um vídeo (MP4) hospedado em outro lugar" value={link} onChange={(e) => setLink(e.target.value)} />
          <button
            className="btn btn-sm"
            disabled={!!busy || !/^https?:\/\//.test(link.trim())}
            onClick={() => create(decodeURIComponent(link.trim().split("/").pop() || "video.mp4"), link.trim()).catch((e) => setError(String(e)))}
          >
            Adicionar link
          </button>
        </div>
        {busy && <p className="hint">{busy}</p>}
        {error && <p className="error-text">{error}</p>}
        <p className="hint">MP4 (H.264) toca em qualquer celular. Vídeos longos: no plano grátis do Supabase o limite é 50 MB por arquivo; acima disso, cole um link.</p>
      </div>
      <div className="entity-grid">
        {data?.videos.map((v) => (
          <div key={v.id} className="card entity-card">
            <video className="thumb" src={`${v.url}#t=1`} poster={v.posterUrl || undefined} muted playsInline preload="metadata" />
            <div className="serif" style={{ fontSize: 17, wordBreak: "break-all" }}>
              {v.name}
            </div>
            <div className="hint">
              {formatMs(v.durationMs)} · {v.timeline.markers?.length ?? 0} upsell(s) · {v.timeline.chat?.length ?? 0} fala(s)
            </div>
            <div className="row">
              <Link className="btn btn-sm btn-primary" href={`/admin/videos/${v.id}`}>
                Editar
              </Link>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(v)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
        {data?.videos.length === 0 && <div className="card empty">Envie o vídeo que o comprador vai assistir na chamada.</div>}
      </div>
    </AdminLayout>
  );
}
