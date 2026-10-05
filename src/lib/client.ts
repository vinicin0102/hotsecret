// Cliente HTTP do painel (prefixa basePath e padroniza erros).
import { withBase } from "./paths";

export class ClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(withBase(path), {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !path.includes("/auth/")) {
    window.location.href = withBase(`/admin/login?next=${encodeURIComponent(window.location.pathname.replace(withBase(""), ""))}`);
  }
  if (!res.ok) {
    const d = data as { error?: string; issues?: { path: string; message: string }[] };
    const detail = d.issues?.length ? `: ${d.issues.map((i) => `${i.path} ${i.message}`).join("; ")}` : "";
    throw new ClientError(res.status, (d.error ?? "Erro") + detail);
  }
  return data as T;
}

/** PUT com progresso (fetch não informa o andamento do envio). */
function putWithProgress(url: string, file: File, onProgress?: (pct: number) => void): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("rede"));
    xhr.send(file);
  });
}

export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const ticket = await api<{ mode: "direct" | "server"; uploadUrl?: string; publicUrl?: string; maxServerBytes: number }>(
    "/api/admin/upload-ticket",
    { body: { mime: file.type, size: file.size } },
  );
  // 1) envio direto ao Supabase Storage (sem passar pelo limite de 4,5MB da Vercel)
  let directError = "";
  if (ticket.mode === "direct" && ticket.uploadUrl && ticket.publicUrl) {
    try {
      const res = await putWithProgress(ticket.uploadUrl, file, onProgress);
      if (res.ok) return ticket.publicUrl;
      const body = res.text.slice(0, 300);
      let detail = body;
      try {
        const j = JSON.parse(body) as { message?: string; error?: string };
        detail = j.message || j.error || body;
      } catch {
        /* texto puro */
      }
      directError = `O armazenamento (Supabase) recusou o arquivo (${res.status}${detail ? `: ${detail}` : ""}).`;
      console.warn("[upload] envio direto falhou", res.status, body);
    } catch (e) {
      directError = "A conexão caiu durante o envio para o armazenamento (Supabase). Tente de novo numa rede mais estável.";
      console.warn("[upload] envio direto falhou", e);
    }
  }
  // 2) envio pelo servidor (Vercel Blob ou banco de dados)
  if (file.size > ticket.maxServerBytes) {
    if (directError) throw new ClientError(502, `${directError} Para vídeos grandes: comprima (ex.: 720p) ou cole um link.`);
    throw new ClientError(413, `Arquivo grande demais (máx. ${Math.round(ticket.maxServerBytes / 1024 / 1024)}MB sem storage externo). Comprima o arquivo ou cole uma URL.`);
  }
  const res = await fetch(withBase("/api/admin/upload"), {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ClientError(res.status, data.error ?? "Falha no upload");
  return data.url as string;
}
