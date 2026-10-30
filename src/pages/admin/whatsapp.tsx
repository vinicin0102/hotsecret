// WhatsApp (Evolution API ou uazapi): conexão, webhook, qual Cérebro responde e os contatos (assumir/devolver para a IA).
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";

type Lang = "pt-BR" | "es-MX" | "es-AR";
interface Settings {
  enabled: boolean;
  brainId: string | null;
  language: Lang;
  notice: string;
  pausedAll: boolean;
}
interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  leadId: string;
  paused: boolean;
  pausedUntil: string | null;
  lastInboundAt: string;
  last: { sender: string; text: string; at: string } | null;
}
interface Data {
  configured: boolean;
  missing: string[];
  provider: string | null;
  instance: string | null;
  state: string | null;
  stateError: string | null;
  webhookUrl: string | null;
  settings: Settings;
  contacts: Contact[];
}

const NOTICE: Record<Lang, string> = {
  "pt-BR": "🤖 Este é um atendimento automatizado.",
  "es-MX": "🤖 Esta es una atención automatizada.",
  "es-AR": "🤖 Esta es una atención automatizada.",
};
const STATE: Record<string, [string, string]> = {
  open: ["Conectado", "pill-on"],
  connecting: ["Conectando… (leia o QR Code no painel do serviço)", ""],
  close: ["Desconectado — conecte o número no painel do serviço", ""],
};
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function WhatsAppPage() {
  const { data, reload } = useFetch<Data>("/api/admin/whatsapp");
  const { data: br } = useFetch<{ brains: { id: string; name: string; active: boolean }[] }>("/api/admin/brains");
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data?.settings) setS((cur) => cur ?? data.settings);
  }, [data]);

  const set = (patch: Partial<Settings>) => {
    if (!s) return;
    setS({ ...s, ...patch });
    setSaved("idle");
  };
  const save = async () => {
    if (!s) return;
    setSaved("saving");
    setMsg(null);
    try {
      await api("/api/admin/whatsapp", { method: "PUT", body: s });
      setSaved("saved");
    } catch (e) {
      setSaved("idle");
      setMsg({ text: e instanceof Error ? e.message : "Erro ao salvar", error: true });
    }
  };
  const hookUp = async () => {
    setMsg(null);
    try {
      await api("/api/admin/whatsapp/webhook", { body: {} });
      setMsg({ text: "Webhook configurado ✓ — mande uma mensagem para o número para testar." });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro ao configurar", error: true });
    }
  };
  const pause = async (c: Contact, paused: boolean) => {
    await api(`/api/admin/whatsapp/contacts/${c.id}`, { method: "PUT", body: { paused } });
    void reload();
  };
  const copy = async () => {
    if (!data?.webhookUrl) return;
    await navigator.clipboard.writeText(data.webhookUrl).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const state = data?.state ? (STATE[data.state] ?? [data.state, ""]) : null;
  return (
    <AdminLayout
      title="WhatsApp"
      subtitle="O Cérebro responde no seu número de WhatsApp (Evolution API ou uazapi) — mesmas falas, prévias, áudios e esteira de ofertas, com o PIX na conversa"
      actions={
        s && (
          <button className="btn btn-primary" onClick={() => void save()} disabled={saved === "saving"}>
            {saved === "saving" ? "Salvando..." : saved === "saved" ? "Salvo ✓" : "Salvar"}
          </button>
        )
      }
    >
      {msg && <p className={msg.error ? "error-text" : "hint"}>{msg.text}</p>}
      <div className="wa-grid">
        <div className="card">
          <div className="card-head">
            <h3>Conexão</h3>
            {state && <span className={`pill ${state[1]}`}>{state[0]}</span>}
          </div>
          {!data ? (
            <p className="hint">Carregando...</p>
          ) : !data.configured ? (
            <>
              <p className="hint">
                Na Vercel (projeto → Settings → Environment Variables), crie estas variáveis e faça um novo deploy:
              </p>
              <ul className="wa-list">
                {data.missing.map((k) => (
                  <li key={k}>
                    <code>{k}</code>
                  </li>
                ))}
              </ul>
              <p className="hint">
                <b>uazapi:</b> <code>WHATSAPP_API_URL</code> = o endereço do servidor (https://SEU-SUBDOMINIO.uazapi.com) ·{" "}
                <code>WHATSAPP_API_KEY</code> = o token da instância.
                <br />
                <b>Evolution API:</b> <code>WHATSAPP_API_URL</code> = o endereço da sua Evolution · <code>WHATSAPP_API_KEY</code> = a chave global
                (AUTHENTICATION_API_KEY) · <code>WHATSAPP_INSTANCE</code> = o nome da instância.
              </p>
            </>
          ) : (
            <>
              <p className="hint">
                <b>{data.provider}</b>
                {data.instance ? (
                  <>
                    {" "}
                    · instância <b>{data.instance}</b>
                  </>
                ) : null}
                {data.stateError ? (
                  <>
                    {" "}
                    · <span className="error-text">{data.stateError}</span>
                  </>
                ) : null}
              </p>
              <div className="field">
                <label>Endereço do webhook (mensagens recebidas)</label>
                <div className="row">
                  <input className="input" readOnly value={data.webhookUrl ?? ""} onFocus={(e) => e.currentTarget.select()} />
                  <button className="btn btn-sm" onClick={() => void copy()}>
                    {copied ? "Copiado ✓" : "Copiar"}
                  </button>
                </div>
                <span className="hint">Não compartilhe este endereço: ele tem a senha do webhook.</span>
              </div>
              <button className="btn" onClick={() => void hookUp()}>
                Configurar webhook automaticamente
              </button>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Respostas</h3>
            {s && (
              <label className="checkbox">
                <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Ativo
              </label>
            )}
          </div>
          {s && (
            <>
              <div className="field">
                <label htmlFor="wa-brain">Cérebro que responde</label>
                <select id="wa-brain" className="select" value={s.brainId ?? ""} onChange={(e) => set({ brainId: e.target.value || null })}>
                  <option value="">— escolha o cérebro —</option>
                  {br?.brains.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.active ? "" : "(inativo)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Idioma</label>
                <div className="segmented">
                  {(
                    [
                      ["pt-BR", "🇧🇷 Português"],
                      ["es-MX", "🇲🇽 Espanhol (MX)"],
                      ["es-AR", "🇦🇷 Espanhol (AR)"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      className={s.language === v ? "active" : ""}
                      // troca o aviso junto, se ainda for o padrão
                      onClick={() => set({ language: v, ...(Object.values(NOTICE).includes(s.notice as never) ? { notice: NOTICE[v] } : {}) })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="wa-notice">Aviso de atendimento automatizado (1ª mensagem de cada contato)</label>
                <input id="wa-notice" className="input" value={s.notice} onChange={(e) => set({ notice: e.target.value })} />
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={s.pausedAll} onChange={(e) => set({ pausedAll: e.target.checked })} /> Pausar todas as respostas (as
                mensagens continuam chegando no painel)
              </label>
              <p className="hint" style={{ marginTop: 10 }}>
                A IA responde só quem manda mensagem — ela nunca inicia conversas. Se você responder um contato pelo celular, a IA fica quieta
                naquele contato por 12 horas. Ofertas chegam como mensagem com o preço e o PIX (copia e cola); pago, o acesso é enviado na hora.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>Contatos</h3>
          <button className="btn btn-sm" onClick={() => void reload()}>
            Atualizar
          </button>
        </div>
        {data && data.contacts.length === 0 && <p className="hint">Ninguém chamou no WhatsApp ainda.</p>}
        <div className="wa-contacts">
          {data?.contacts.map((c) => {
            const auto = c.pausedUntil && new Date(c.pausedUntil) > new Date();
            return (
              <div key={c.id} className="wa-contact">
                <div className="wa-contact-who">
                  <b>{c.name || "Sem nome"}</b>
                  <small>{c.phone ? `+${c.phone}` : "número oculto"}</small>
                </div>
                <div className="wa-contact-last">
                  {c.last ? (
                    <>
                      <small>{fmt(c.last.at)}</small> {c.last.sender === "user" ? "" : "↪ "}
                      {c.last.text}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <span className={`pill ${c.paused || auto ? "" : "pill-on"}`}>
                  {c.paused ? "Você assumiu" : auto ? `Pausada até ${fmt(c.pausedUntil!)}` : "IA respondendo"}
                </span>
                <div className="row">
                  {c.paused || auto ? (
                    <button className="btn btn-sm" onClick={() => void pause(c, false)}>
                      Devolver para a IA
                    </button>
                  ) : (
                    <button className="btn btn-sm" onClick={() => void pause(c, true)}>
                      Assumir conversa
                    </button>
                  )}
                  <Link className="btn btn-sm btn-ghost" href={`/admin/leads/${c.leadId}`}>
                    Ver conversa
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
}
