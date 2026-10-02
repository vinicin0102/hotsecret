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

export async function uploadFile(file: File): Promise<string> {
  const ticket = await api<{ mode: "direct" | "server"; uploadUrl?: string; publicUrl?: string; maxServerBytes: number }>(
    "/api/admin/upload-ticket",
    { body: { mime: file.type, size: file.size } },
  );
  // 1) envio direto ao Supabase Storage (sem passar pelo limite de 4,5MB da Vercel)
  if (ticket.mode === "direct" && ticket.uploadUrl && ticket.publicUrl) {
    try {
      const res = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (res.ok) return ticket.publicUrl;
      console.warn("[upload] envio direto falhou", res.status);
    } catch (e) {
      console.warn("[upload] envio direto falhou", e);
    }
  }
  // 2) envio pelo servidor (Vercel Blob ou banco de dados)
  if (file.size > ticket.maxServerBytes) {
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
