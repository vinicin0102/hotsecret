// Cérebro: chave da IA, personalidade, conteúdo, ofertas e áudios que a IA usa para conversar com os leads.
import { useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UploadInput } from "@/components/admin/UploadInput";
import { useFetch } from "@/hooks/useFetch";
import { api, uploadFile } from "@/lib/client";
import { formatBRL, formatDateTime } from "@/lib/format";
import { shortId } from "@/features/chat-engine/engine";
import { VipOfferEditor } from "@/components/admin/VipOfferEditor";
import type { VipOfferTexts } from "@/types/flow";

type Provider = "anthropic" | "deepseek";
interface ProviderSettings {
  configured: boolean;
  fromEnv: boolean;
  keyHint: string | null;
  model: string;
  models: { id: string; label: string }[];
}
interface AiSettings extends ProviderSettings {
  provider: Provider;
  providers: Record<Provider, ProviderSettings>;
}
const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Claude (Anthropic)", deepseek: "DeepSeek" };
interface TarotCard {
  id: string;
  label?: string;
  name?: string;
  imageUrl?: string;
  meaning?: string;
}
const defaultTarot = (): TarotCard[] =>
  ["Passado", "Presente", "Futuro"].map((label) => ({ id: shortId("tc"), label, name: "", imageUrl: "", meaning: "" }));
interface Offer {
  id: string;
  productId: string;
  style?: "card" | "call" | "tarot" | "live";
  /** chamada de vídeo 02 */
  freeLoop?: boolean;
  vip?: VipOfferTexts;
  videoId?: string;
  tarotCards?: TarotCard[];
  tarotBackUrl?: string;
  downsellProductId?: string;
  downsellText?: string;
  when?: string;
  pitch?: string;
  headline?: string;
  ctaLabel?: string;
}
interface Audio {
  id: string;
  url: string;
  when?: string;
}
interface Brain {
  id: string;
  name: string;
  active: boolean;
  persona: string;
  knowledge: string;
  rules: string;
  mustRules: string;
  examples?: string;
  offers: Offer[];
  audios: Audio[];
  images: (Audio & { kind?: "image" | "video" })[];
  voiceCalls?: VoiceCallItem[];
  maxReplies: number;
  fallbackMessage: string;
}
interface VoiceCallItem {
  id: string;
  url: string;
  when?: string;
  offerId?: string;
  endText?: string;
}
interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
}
type Draft = Omit<Brain, "id"> & { id?: string };

const EMPTY: Draft = {
  name: "Novo cérebro",
  active: true,
  persona: "",
  knowledge: "",
  rules: "",
  mustRules: "",
  examples: "",
  offers: [],
  audios: [],
  images: [],
  maxReplies: 30,
  fallbackMessage: "",
};

function ConnectionCard() {
  const { data, reload } = useFetch<{ settings: AiSettings; health?: { replies: number; failures: number; recent: { at: string; error: string }[] } }>(
    "/api/admin/ai-settings",
  );
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [tab, setTab] = useState<Provider | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const all = data?.settings;
  const provider: Provider = tab ?? all?.provider ?? "anthropic";
  const s = all ? (all.providers?.[provider] ?? all) : undefined;

  const save = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/ai-settings", { method: "PUT", body });
      setKey("");
      await reload();
      setMsg({ text: okText });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro ao salvar", error: true });
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; error?: string; model?: string }>("/api/admin/ai-settings/test", { body: {} });
      setMsg(r.ok ? { text: `Conectado ✓ (${r.model})` } : { text: r.error ?? "Falhou", error: true });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Falhou", error: true });
    } finally {
      setBusy(false);
    }
  };

  if (!all || !s) return <div className="card">Carregando...</div>;
  const active = all.provider ?? "anthropic";
  return (
    <div className="card">
      <div className="card-head">
        <h3>Conexão com a IA</h3>
        <span className={`pill ${all.configured ? "status-PUBLISHED" : "status-ARCHIVED"}`}>
          {all.configured ? `Em uso: ${PROVIDER_LABEL[active]} · ${all.keyHint}` : `${PROVIDER_LABEL[active]} sem chave`}
        </span>
      </div>
      <div className="field">
        <label>Qual IA responde os leads</label>
        <div className="segmented">
          {(["anthropic", "deepseek"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={provider === p ? "active" : ""}
              onClick={() => {
                setTab(p);
                setKey("");
                setModel("");
                setMsg(null);
              }}
            >
              {PROVIDER_LABEL[p]}
              {active === p ? " ✓" : ""}
            </button>
          ))}
        </div>
      </div>
      {provider === "anthropic" ? (
        <p className="hint" style={{ marginTop: -6 }}>
          Crie a chave em{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            console.anthropic.com → API Keys
          </a>{" "}
          (começa com <code className="inline">sk-ant-</code>). O Claude vê as fotos que o lead manda. O uso é cobrado pela Anthropic na sua conta.
        </p>
      ) : (
        <p className="hint" style={{ marginTop: -6 }}>
          Crie a chave em{" "}
          <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">
            platform.deepseek.com → API keys
          </a>{" "}
          (começa com <code className="inline">sk-</code>) e coloque saldo na conta. A DeepSeek é mais barata, mas não vê as fotos que o lead manda
          (ela só sabe que chegou uma foto). O uso é cobrado pela DeepSeek na sua conta.
        </p>
      )}
      <p className="hint">A chave fica guardada criptografada no servidor e nunca aparece no chat. Ao salvar, esta IA passa a responder os leads.</p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="ai-key">{s.configured ? `Trocar chave da ${PROVIDER_LABEL[provider]}` : `Chave da ${PROVIDER_LABEL[provider]}`}</label>
          <input
            id="ai-key"
            className="input"
            type="password"
            autoComplete="off"
            placeholder={s.configured ? `Deixe vazio para manter a atual (${s.keyHint})` : provider === "deepseek" ? "sk-..." : "sk-ant-..."}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ai-model">Modelo</label>
          <select id="ai-model" className="select" value={model || s.model} onChange={(e) => setModel(e.target.value)}>
            {s.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || (!s.configured && !key.trim())}
          onClick={() => save({ provider, ...(key.trim() ? { apiKey: key.trim() } : {}), model: model || s.model }, `Salvo ✓ ${PROVIDER_LABEL[provider]} responde os leads`)}
        >
          {active === provider ? "Salvar" : `Salvar e usar ${PROVIDER_LABEL[provider]}`}
        </button>
        <button className="btn btn-sm" disabled={busy || !all.configured || active !== provider} onClick={test}>
          Testar conexão
        </button>
        {s.configured && !s.fromEnv && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("Remover a chave desta IA?") && save({ provider, apiKey: null }, "Chave removida")}>
            Remover chave
          </button>
        )}
        {msg && <span className={msg.error ? "error-text" : "hint"}>{msg.text}</span>}
      </div>
      {data?.health && (data.health.replies > 0 || data.health.recent.length > 0) && (
        <div className="ai-health">
          <div className="section-title">Saúde da IA (últimas 24h)</div>
          <p className="hint">
            {data.health.replies} resposta(s) ·{" "}
            <b className={data.health.failures ? "error-text" : "check-ok"}>
              {data.health.failures} falha(s){data.health.replies ? ` (${Math.round((data.health.failures / data.health.replies) * 100)}%)` : ""}
            </b>{" "}
            — cada falha manda a "Mensagem se a IA falhar". Antes disso o sistema já tenta de novo sozinho.
          </p>
          {data.health.recent.length > 0 && (
            <ul className="ai-errors">
              {data.health.recent.map((e, i) => (
                <li key={i}>
                  <span className="hint">{formatDateTime(e.at)}</span> {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TestChat({ brain }: { brain: Brain }) {
  const [history, setHistory] = useState<{ role: "lead" | "bot"; text: string; audio?: string; image?: string; video?: string; offer?: string; voice?: boolean }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"pt-BR" | "es-MX" | "es-AR">("pt-BR");
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [history, busy]);

  const send = async (msg: string | null) => {
    setError(null);
    const next = msg ? [...history, { role: "lead" as const, text: msg }] : history;
    setHistory(next);
    setText("");
    setBusy(true);
    try {
      const r = await api<{
        messages: string[];
        audio: { url: string; when?: string } | null;
        image: { url: string; when?: string; kind?: string } | null;
        offer: { name: string; price: number; headline: string; style?: string } | null;
        end: boolean;
        failure?: string;
        voiceCall?: { id: string } | null;
      }>(`/api/admin/brains/${brain.id}/test`, {
        body: {
          history: next.map((h) => ({
            role: h.role,
            text: h.voice ? "[ligou para o lead (ligação de voz)]" : h.video ? "[enviou um vídeo]" : h.image ? "[enviou uma foto]" : h.audio ? "[enviou um áudio]" : h.offer ? `[mostrou o card da oferta ${h.offer}]` : h.text,
          })),
          language,
        },
      });
      const bot = [
        ...r.messages.map((m) => ({ role: "bot" as const, text: m })),
        ...(r.image
          ? [{ role: "bot" as const, text: r.image.when ?? "", ...(r.image.kind === "video" ? { video: r.image.url } : { image: r.image.url }) }]
          : []),
        ...(r.audio ? [{ role: "bot" as const, text: r.audio.when ?? "", audio: r.audio.url }] : []),
        ...(r.offer
          ? [{ role: "bot" as const, text: "", offer: `${r.offer.style === "call" ? "📹 Ligação" : r.offer.style === "tarot" ? "🔮 Cartas de tarot" : r.offer.style === "live" ? "🔴 Canal VIP AO VIVO" : "🛒 Oferta"}: ${r.offer.headline} · ${formatBRL(r.offer.price)}` }]
          : []),
        ...(r.voiceCall ? [{ role: "bot" as const, text: "📞 Ligou para o lead (no chat de verdade toca a ligação de voz)", voice: true }] : []),
        ...(r.end ? [{ role: "bot" as const, text: "— a IA encerrou a conversa —" }] : []),
      ];
      setHistory([...next, ...bot]);
      // a IA falhou e saiu a "Mensagem se a IA falhar": mostra o motivo (só aqui no painel)
      if (r.failure) setError(`A IA falhou: ${r.failure}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falhou");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card brain-test">
      <div className="card-head">
        <h3>Testar conversa</h3>
        <div className="row">
          <select className="select" style={{ width: "auto" }} value={language} onChange={(e) => setLanguage(e.target.value === "es-MX" || e.target.value === "es-AR" ? e.target.value : "pt-BR")} aria-label="Idioma do teste">
            <option value="pt-BR">🇧🇷 Português</option>
            <option value="es-MX">🇲🇽 Español (México)</option>
          <option value="es-AR">🇦🇷 Español (Argentina)</option>
            <option value="es-AR">🇦🇷 Español (Argentina)</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => setHistory([])}>
            Limpar
          </button>
        </div>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        Converse como se fosse um lead. Usa a versão <b>salva</b> do cérebro; nada aqui é gravado.
      </p>
      <div className="brain-test-body" ref={bodyRef}>
        {history.length === 0 && (
          <button className="btn btn-sm" disabled={busy} onClick={() => send(null)}>
            Deixar a IA começar
          </button>
        )}
        {history.map((h, i) => (
          <div key={i} className={`bt-msg ${h.role}`}>
            {h.video ? (
              <video src={h.video} controls playsInline style={{ maxWidth: 200, borderRadius: 10, display: "block" }} />
            ) : h.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={h.image} alt="" style={{ maxWidth: 180, borderRadius: 10, display: "block" }} />
            ) : h.audio ? (
              <audio src={h.audio} controls preload="none" />
            ) : h.offer ? (
              <span className="pill">{h.offer}</span>
            ) : (
              h.text
            )}
          </div>
        ))}
        {busy && <div className="bt-msg bot dim">digitando...</div>}
        {error && <div className="error-text">{error}</div>}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !busy) void send(text.trim());
        }}
      >
        <input className="input" placeholder="Escreva como o lead..." value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}

type ImproveField = "persona" | "knowledge" | "mustRules" | "examples";
const IMPROVE_FIELDS: { field: ImproveField; label: string; action: string }[] = [
  { field: "persona", label: "Personalidade e jeito de falar", action: "Usar esta versão" },
  { field: "knowledge", label: "Perguntas frequentes e objeções (acrescenta ao conteúdo)", action: "Acrescentar ao conteúdo" },
  { field: "mustRules", label: "Regras obrigatórias", action: "Usar estas regras" },
  { field: "examples", label: "Exemplos de conversa", action: "Usar estes exemplos" },
];

/** A IA em uso sugere cada campo do cérebro; o dono revisa e aceita (depois clica em Salvar cérebro). */
function ImproveCard({ draft, apply }: { draft: Draft; apply: (field: ImproveField, value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState("");
  const [lang, setLang] = useState<"pt-BR" | "es-MX" | "es-AR">("pt-BR");
  const [pick, setPick] = useState<Record<ImproveField, boolean>>({ persona: true, knowledge: true, mustRules: true, examples: true });
  const [busy, setBusy] = useState<ImproveField | null>(null);
  const [out, setOut] = useState<Partial<Record<ImproveField, { text?: string; error?: string; used?: boolean }>>>({});
  // trocou de cérebro: limpa as sugestões do anterior
  useEffect(() => {
    setOut({});
    setAbout("");
    setOpen(false);
  }, [draft.id]);

  const run = async () => {
    setOut({});
    for (const { field } of IMPROVE_FIELDS) {
      if (!pick[field]) continue;
      setBusy(field);
      try {
        const r = await api<{ text: string }>("/api/admin/brains/improve", {
          body: {
            field,
            about,
            language: lang,
            draft: {
              name: draft.name,
              persona: draft.persona,
              knowledge: draft.knowledge,
              rules: draft.rules,
              mustRules: draft.mustRules,
              examples: draft.examples,
              offers: draft.offers.map((o) => ({ productId: o.productId, when: o.when, pitch: o.pitch, style: o.style })),
            },
          },
        });
        setOut((p) => ({ ...p, [field]: { text: r.text } }));
      } catch (e) {
        setOut((p) => ({ ...p, [field]: { error: e instanceof Error ? e.message : "Falhou" } }));
      }
    }
    setBusy(null);
  };
  const use = (field: ImproveField) => {
    const text = out[field]?.text;
    if (!text) return;
    const value = field === "knowledge" ? `${draft.knowledge.trim()}${draft.knowledge.trim() ? "\n\n" : ""}${text}` : text;
    apply(field, value);
    setOut((p) => ({ ...p, [field]: { ...p[field], used: true } }));
  };

  if (!open)
    return (
      <div className="card improve-card">
        <div className="card-head">
          <h3>✨ Melhorar com IA</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            Abrir
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          A IA em uso lê este cérebro e os produtos das ofertas e sugere uma personalidade mais completa, perguntas frequentes e respostas para
          objeções, regras obrigatórias e exemplos de conversa. Você revisa e escolhe o que usar.
        </p>
      </div>
    );
  return (
    <div className="card improve-card">
      <div className="card-head">
        <h3>✨ Melhorar com IA</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
      <div className="field">
        <label htmlFor="imp-about">Conte rapidinho sobre o seu negócio (opcional, mas ajuda muito)</label>
        <textarea
          id="imp-about"
          className="textarea"
          rows={3}
          placeholder="Ex.: vendo packs de fotos e chamadas de vídeo da Bianca. Público masculino, 25–45 anos. O que mais vende é o Pack VIP. As dúvidas mais comuns são se é seguro e como recebe."
          value={about}
          onChange={(e) => setAbout(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="imp-lang">Idioma dos textos gerados</label>
        <select id="imp-lang" className="select" value={lang} onChange={(e) => setLang(e.target.value === "es-MX" || e.target.value === "es-AR" ? e.target.value : "pt-BR")}>
          <option value="pt-BR">🇧🇷 Português (Brasil)</option>
          <option value="es-MX">🇲🇽 Español (México)</option>
          <option value="es-AR">🇦🇷 Español (Argentina)</option>
        </select>
      </div>
      <div className="improve-picks">
        {IMPROVE_FIELDS.map(({ field, label }) => (
          <label key={field} className="check">
            <input type="checkbox" checked={pick[field]} onChange={(e) => setPick({ ...pick, [field]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={!!busy || !Object.values(pick).some(Boolean)} onClick={() => void run()}>
          {busy ? `Gerando: ${IMPROVE_FIELDS.find((f) => f.field === busy)?.label}…` : "Gerar sugestões"}
        </button>
        <span className="hint">Leva uns segundos por item. Nada é salvo até você clicar em “Salvar cérebro”.</span>
      </div>
      {IMPROVE_FIELDS.filter(({ field }) => out[field]).map(({ field, label, action }) => {
        const o = out[field]!;
        return (
          <div key={field} className="improve-out">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{label}</b>
              {o.text && (
                <button className="btn btn-sm" disabled={o.used} onClick={() => use(field)}>
                  {o.used ? "Usado ✓" : action}
                </button>
              )}
            </div>
            {o.error ? <p className="error-text">{o.error}</p> : <pre className="improve-text">{o.text}</pre>}
          </div>
        );
      })}
    </div>
  );
}

export default function CerebroPage() {
  const { data, reload } = useFetch<{ brains: Brain[] }>("/api/admin/brains");
  const { data: prod } = useFetch<{ products: Product[] }>("/api/admin/products");
  const { data: vids } = useFetch<{ videos: { id: string; name: string }[] }>("/api/admin/videos");
  const videos = vids?.videos ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const brains = data?.brains ?? [];
  const products = prod?.products ?? [];

  useEffect(() => {
    if (!selected && brains.length && !draft) setSelected(brains[0].id);
  }, [brains, selected, draft]);
  useEffect(() => {
    const b = brains.find((x) => x.id === selected);
    if (b) setDraft({ ...b });
  }, [selected, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setOffer = (i: number, patch: Partial<Offer>) => set("offers", draft!.offers.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setImage = (i: number, patch: Partial<Audio>) =>
    setDraft((d) => (d ? { ...d, images: (d.images ?? []).map((a, j) => (j === i ? { ...a, ...patch } : a)) } : d));
  const imagesRef = useRef<HTMLInputElement>(null);
  const [imgBusy, setImgBusy] = useState<string | null>(null);
  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    for (let k = 0; k < list.length; k++) {
      setImgBusy(`Enviando ${k + 1} de ${list.length}...`);
      try {
        const file = list[k];
        const url = await uploadFile(file);
        const kind = file.type.startsWith("video/") ? ("video" as const) : ("image" as const);
        setDraft((d) => (d ? { ...d, images: [...(d.images ?? []), { id: shortId("im"), url, when: "", kind }] } : d));
      } catch (e) {
        setImgBusy(e instanceof Error ? e.message : "Falha no envio");
        return;
      }
    }
    setImgBusy(null);
    if (imagesRef.current) imagesRef.current.value = "";
  };
  const setAudio = (i: number, patch: Partial<Audio>) =>
    setDraft((d) => (d ? { ...d, audios: d.audios.map((a, j) => (j === i ? { ...a, ...patch } : a)) } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    const { id, ...body } = draft;
    try {
      const r = id
        ? await api<{ brain: Brain }>(`/api/admin/brains/${id}`, { method: "PUT", body })
        : await api<{ brain: Brain }>("/api/admin/brains", { body });
      await reload();
      setSelected(r.brain.id);
      setMsg({ text: "Cérebro salvo ✓" });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro ao salvar", error: true });
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!draft?.id || !confirm(`Excluir o cérebro "${draft.name}"? Os blocos de IA que usam ele param de responder.`)) return;
    await api(`/api/admin/brains/${draft.id}`, { method: "DELETE" });
    setDraft(null);
    setSelected(null);
    await reload();
  };

  const saved = brains.find((b) => b.id === draft?.id);

  return (
    <AdminLayout
      title="Cérebro"
      subtitle="A IA que conversa com os leads: personalidade, conteúdo, ofertas e áudios"
      actions={
        <button
          className="btn btn-primary"
          onClick={() => {
            setSelected(null);
            setDraft({ ...EMPTY, offers: [], audios: [], images: [] });
          }}
        >
          + Novo cérebro
        </button>
      }
    >
      <ConnectionCard />
      <div className="brain-layout">
        <div className="card brain-list">
          <h3>Cérebros</h3>
          {brains.length === 0 && !draft && <p className="hint">Crie o primeiro cérebro.</p>}
          {brains.map((b) => (
            <button key={b.id} className={`brain-item ${b.id === draft?.id ? "active" : ""}`} onClick={() => setSelected(b.id)}>
              <b>🧠 {b.name}</b>
              <small>
                {b.active ? "ativo" : "inativo"} · {b.offers.length} oferta(s) · {b.audios.length} áudio(s) · {(b.images ?? []).length} prévia(s){(b.voiceCalls ?? []).length ? ` · ${(b.voiceCalls ?? []).length} ligação(ões)` : ""}
              </small>
            </button>
          ))}
          <p className="hint" style={{ marginTop: 12 }}>
            Para usar, coloque o bloco <b>🧠 Cérebro (IA)</b> no fluxo e escolha o cérebro.
          </p>
        </div>

        {draft && (
          <div className="brain-editor">
            <ImproveCard draft={draft} apply={(field, value) => set(field, value)} />
            <div className="card">
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="b-name">Nome</label>
                  <input id="b-name" className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="b-max">Máximo de respostas da IA por conversa</label>
                  <input
                    id="b-max"
                    className="input"
                    type="number"
                    min={1}
                    max={200}
                    value={draft.maxReplies}
                    onChange={(e) => set("maxReplies", Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                  />
                </div>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
                Ativo
              </label>
              <div className="field">
                <label htmlFor="b-persona">Personalidade e jeito de falar</label>
                <textarea
                  id="b-persona"
                  className="textarea"
                  rows={5}
                  placeholder={'Ex.: Você é a Júlia, 27 anos, terapeuta de casais. Fala de um jeito carinhoso e direto, usa "amor" às vezes, escreve tudo em minúsculas e manda mensagens curtas.'}
                  value={draft.persona}
                  onChange={(e) => set("persona", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="b-know">Conteúdo para a IA se basear</label>
                <textarea
                  id="b-know"
                  className="textarea"
                  rows={12}
                  placeholder="Cole aqui tudo o que a IA precisa saber: o que é o produto, o que tem dentro, para quem é, perguntas frequentes, como quebrar cada objeção, depoimentos..."
                  value={draft.knowledge}
                  onChange={(e) => set("knowledge", e.target.value)}
                />
                <div className="hint">{draft.knowledge.length.toLocaleString("pt-BR")} / 60.000 caracteres</div>
              </div>
              <div className="field must-rules">
                <label htmlFor="b-must">Regras obrigatórias (o que a IA DEVE seguir sempre)</label>
                <textarea
                  id="b-must"
                  className="textarea"
                  rows={5}
                  placeholder={"Uma regra por linha. Ex.:\nSempre chame o lead de amor\nSempre responda com no máximo 2 mensagens\nSempre pergunte o nome do lead antes de oferecer qualquer coisa"}
                  value={draft.mustRules ?? ""}
                  onChange={(e) => set("mustRules", e.target.value)}
                />
                <div className="hint">
                  Têm prioridade sobre a personalidade, o conteúdo e o objetivo do bloco. Escreva uma regra por linha, de forma direta.
                </div>
              </div>
              <div className="field">
                <label htmlFor="b-examples">Exemplos de conversa (a IA imita o jeito)</label>
                <textarea
                  id="b-examples"
                  className="textarea"
                  rows={6}
                  placeholder={"Cole 1 a 3 conversas que venderam bem. Ex.:\nLead: oi\nVocê: oii amor 😊 tudo bem? o que te trouxe aqui?\nLead: quanto custa?\nVocê: depende do que você quer ver kkk me conta...\n---\n(outra conversa)"}
                  value={draft.examples ?? ""}
                  onChange={(e) => set("examples", e.target.value)}
                />
                <div className="hint">A IA copia o tom, o ritmo e a forma de conduzir — não as frases palavra por palavra.</div>
              </div>
              <div className="field">
                <label htmlFor="b-rules">Regras (o que ela nunca deve fazer)</label>
                <textarea
                  id="b-rules"
                  className="textarea"
                  rows={4}
                  placeholder="Ex.: nunca prometa resultado garantido; não fale de concorrentes; se pedirem reembolso, diga que é pelo e-mail suporte@..."
                  value={draft.rules}
                  onChange={(e) => set("rules", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="b-fallback">Mensagem se a IA falhar (opcional)</label>
                <input
                  id="b-fallback"
                  className="input"
                  placeholder="Hmm, me perdi aqui 😅 pode repetir?"
                  value={draft.fallbackMessage}
                  onChange={(e) => set("fallbackMessage", e.target.value)}
                />
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Ofertas</h3>
                <button
                  className="btn btn-sm"
                  onClick={() => set("offers", [...draft.offers, { id: shortId("of"), productId: products[0]?.id ?? "", when: "", pitch: "", headline: "", ctaLabel: "" }])}
                >
                  + Adicionar oferta
                </button>
              </div>
              <p className="hint" style={{ marginTop: -6 }}>
                A IA decide a hora certa de mostrar o card de compra (PIX, sem cadastro), usando o preço cadastrado no produto. Depois do pagamento,
                o lead recebe o acesso no chat.
              </p>
              {draft.offers.length === 0 && <p className="hint">Nenhuma oferta: a IA só conversa.</p>}
              {draft.offers.map((o, i) => (
                <div key={o.id} className="brain-row">
                  <div className="grid-2">
                    <div className="field">
                      <label>Produto</label>
                      <select className="select" value={o.productId} onChange={(e) => setOffer(i, { productId: e.target.value })}>
                        <option value="">— selecione —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {formatBRL(p.price)} {p.active ? "" : "(inativo)"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Título do card (opcional)</label>
                      <input className="input" value={o.headline ?? ""} onChange={(e) => setOffer(i, { headline: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Formato</label>
                    <div className="segmented">
                      {(
                        [
                          ["card", "Card de compra"],
                          ["call", "📹 Chamada de vídeo"],
                          ["call2", "📹 Chamada de vídeo 02"],
                          ["tarot", "🔮 Cartas de tarot"],
                          ["live", "🔴 Canal VIP AO VIVO"],
                        ] as const
                      ).map(([s, label]) => (
                        <button
                          key={s}
                          type="button"
                          className={
                            // chamada de vídeo 02 = chamada com o FREE em loop ao atender
                            (s === "call2" ? o.style === "call" && !!o.freeLoop : s === "call" ? o.style === "call" && !o.freeLoop : (o.style ?? "card") === s) ? "active" : ""
                          }
                          onClick={() =>
                            setOffer(
                              i,
                              s === "call2"
                                ? { style: "call", freeLoop: true }
                                : s === "tarot" && !o.tarotCards?.length
                                  ? { style: s, tarotCards: defaultTarot(), freeLoop: undefined }
                                  : { style: s, freeLoop: undefined },
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {o.style === "live" && (
                    <VipOfferEditor
                      vip={o.vip}
                      basicProductId={o.downsellProductId || undefined}
                      mainProductId={o.productId}
                      products={products}
                      onChange={(vip) => setOffer(i, { vip })}
                      onBasicChange={(id) => setOffer(i, { downsellProductId: id })}
                      videos={videos}
                      videoId={o.videoId || undefined}
                      onVideoChange={(id) => setOffer(i, { videoId: id })}
                    />
                  )}
                  {o.style === "call" && (
                    <div className="field">
                      <label>Vídeo da chamada</label>
                      <select className="select" value={o.videoId ?? ""} onChange={(e) => setOffer(i, { videoId: e.target.value })}>
                        <option value="">— selecione —</option>
                        {videos.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      {o.freeLoop ? (
                        <p className="hint">
                          <b>Chamada de vídeo 02:</b> quando a IA escolher esta oferta, o lead recebe a ligação. Ao <b>atender</b>, a chamada abre e o
                          trecho <b>FREE</b> toca uma vez. No fim dele o vídeo para e a oferta aparece em forma de upsell (aviso → bloqueado → PIX). Pagou,
                          libera o <b>VIP em loop</b> com o restante da live e os upsells. Recusar a ligação abre o pop-up do downsell, igual à chamada
                          de vídeo.
                        </p>
                      ) : (
                        <p className="hint">
                          Quando a IA escolher esta oferta, o lead recebe a ligação (foto, toque e vibração). Atender abre um pop-up só com o código PIX;
                          Recusar abre o mesmo pop-up com o downsell. O vídeo só começa depois do pagamento aprovado.
                        </p>
                      )}
                      {!o.videoId && <p className="error-text">Sem vídeo, a oferta aparece como card normal.</p>}
                      <div className="grid-2" style={{ marginTop: 10 }}>
                        <div className="field">
                          <label>Downsell ao recusar (opcional)</label>
                          <select className="select" value={o.downsellProductId ?? ""} onChange={(e) => setOffer(i, { downsellProductId: e.target.value })}>
                            <option value="">— nenhum (a IA continua a conversa) —</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} · {formatBRL(p.price)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Texto do pop-up do downsell</label>
                          <input
                            className="input"
                            placeholder="Tudo bem 🥺 que tal uma chamada mais curtinha?"
                            value={o.downsellText ?? ""}
                            onChange={(e) => setOffer(i, { downsellText: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {o.style === "tarot" && (
                    <div className="field">
                      <label>Cartas</label>
                      <p className="hint">
                        No chat aparecem as cartas viradas. O lead toca e vê o preço; depois do PIX aprovado elas viram uma a uma com a leitura.
                        Nome, imagem e leitura só chegam ao lead depois do pagamento (a IA também não vê a leitura, para não entregar antes).
                      </p>
                      <div className="tarot-edit">
                        {(o.tarotCards ?? []).map((c, k) => {
                          const setCard = (patch: Partial<TarotCard>) =>
                            setOffer(i, { tarotCards: (o.tarotCards ?? []).map((x, j) => (j === k ? { ...x, ...patch } : x)) });
                          return (
                            <div key={c.id} className="tarot-edit-card">
                              <div className="row" style={{ justifyContent: "space-between" }}>
                                <strong>Carta {k + 1}</strong>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setOffer(i, { tarotCards: (o.tarotCards ?? []).filter((_, j) => j !== k) })}
                                >
                                  Remover
                                </button>
                              </div>
                              <div className="grid-2">
                                <div className="field">
                                  <label>Posição</label>
                                  <input className="input" placeholder="Passado" value={c.label ?? ""} onChange={(e) => setCard({ label: e.target.value })} />
                                </div>
                                <div className="field">
                                  <label>Nome da carta</label>
                                  <input className="input" placeholder="A Estrela" value={c.name ?? ""} onChange={(e) => setCard({ name: e.target.value })} />
                                </div>
                              </div>
                              <div className="field">
                                <label>Imagem da carta (opcional)</label>
                                <UploadInput value={c.imageUrl ?? ""} onChange={(url) => setCard({ imageUrl: url })} accept="image/*" />
                              </div>
                              <div className="field">
                                <label>Leitura (revelada após o pagamento)</label>
                                <textarea
                                  className="textarea"
                                  rows={3}
                                  placeholder="O que esta carta diz para o lead…"
                                  value={c.meaning ?? ""}
                                  onChange={(e) => setCard({ meaning: e.target.value })}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {(o.tarotCards?.length ?? 0) < 7 && (
                        <button
                          className="btn btn-sm"
                          style={{ marginTop: 8 }}
                          onClick={() =>
                            setOffer(i, { tarotCards: [...(o.tarotCards ?? []), { id: shortId("tc"), label: "", name: "", imageUrl: "", meaning: "" }] })
                          }
                        >
                          + Adicionar carta
                        </button>
                      )}
                      {!(o.tarotCards ?? []).some((c) => c.name || c.imageUrl || c.meaning) && (
                        <p className="error-text">Preencha as cartas: sem elas, a oferta aparece como card normal.</p>
                      )}
                      <div className="field" style={{ marginTop: 10 }}>
                        <label>Verso das cartas (opcional — sem imagem usa o verso padrão dourado)</label>
                        <UploadInput value={o.tarotBackUrl ?? ""} onChange={(url) => setOffer(i, { tarotBackUrl: url })} accept="image/*" />
                      </div>
                    </div>
                  )}
                  <div className="field">
                    <label>Quando oferecer</label>
                    <input
                      className="input"
                      placeholder="Ex.: quando ela contar o problema e perguntar como resolver, ou depois de 3 a 4 trocas de mensagem"
                      value={o.when ?? ""}
                      onChange={(e) => setOffer(i, { when: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Como apresentar (argumentos)</label>
                    <textarea className="textarea" rows={2} value={o.pitch ?? ""} onChange={(e) => setOffer(i, { pitch: e.target.value })} />
                  </div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <input className="input" style={{ maxWidth: 260 }} placeholder="Texto do botão (QUERO ACESSAR ❤️)" value={o.ctaLabel ?? ""} onChange={(e) => setOffer(i, { ctaLabel: e.target.value })} />
                    <button className="btn btn-ghost btn-sm" onClick={() => set("offers", draft.offers.filter((_, j) => j !== i))}>
                      Remover oferta
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Áudios</h3>
                <button className="btn btn-sm" onClick={() => set("audios", [...draft.audios, { id: shortId("au"), url: "", when: "" }])}>
                  + Adicionar áudio
                </button>
              </div>
              <p className="hint" style={{ marginTop: -6 }}>
                Áudios gravados por você. Descreva quando usar cada um; a IA escolhe a hora de mandar (no máximo um por resposta, sem repetir).
              </p>
              {draft.audios.map((a, i) => (
                <div key={a.id} className="brain-row">
                  <div className="field">
                    <label>Arquivo de áudio</label>
                    <UploadInput value={a.url} onChange={(url) => setAudio(i, { url })} accept="audio/*" />
                  </div>
                  <div className="row">
                    <input
                      className="input"
                      placeholder="Quando usar. Ex.: quando perguntarem se é seguro / para dar boas-vindas"
                      value={a.when ?? ""}
                      onChange={(e) => setAudio(i, { when: e.target.value })}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={() => set("audios", draft.audios.filter((_, j) => j !== i))}>
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-head">
                <h3>📞 Ligação de voz</h3>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    set("voiceCalls", [
                      ...(draft.voiceCalls ?? []),
                      { id: shortId("vc"), url: "", when: "", offerId: draft.offers.find((o) => o.style === "call")?.id ?? "", endText: "" },
                    ])
                  }
                >
                  + Adicionar ligação
                </button>
              </div>
              <p className="hint" style={{ marginTop: -6 }}>
                Quando o lead demonstra interesse, pede para ligar ou aceita o convite da IA, toca uma ligação no celular dele (foto, toque e vibração) — ele escolhe atender ou recusar. Ao atender, o seu áudio
                toca numa tela de chamada com cronômetro, como uma ligação de verdade. Quando o áudio termina (ou ele desliga), aparece a sua mensagem e a
                oferta escolhida — ex.: a chamada de vídeo por R$ 19,99. Uma ligação por conversa.
              </p>
              {(draft.voiceCalls ?? []).map((v, i) => {
                const setV = (patch: Partial<VoiceCallItem>) =>
                  set("voiceCalls", (draft.voiceCalls ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={v.id} className="brain-row">
                    <div className="field">
                      <label>Áudio da ligação (o que ela fala)</label>
                      <UploadInput value={v.url} onChange={(url) => setV({ url })} accept="audio/*" />
                    </div>
                    <div className="field">
                      <label>Quando pedir para ligar</label>
                      <input
                        className="input"
                        placeholder="Ex.: depois de 3 ou 4 mensagens, quando ele estiver curioso — pergunte se pode ligar rapidinho"
                        value={v.when ?? ""}
                        onChange={(e) => setV({ when: e.target.value })}
                      />
                    </div>
                    <div className="grid-2">
                      <div className="field">
                        <label>Oferta no fim da ligação</label>
                        <select className="select" value={v.offerId ?? ""} onChange={(e) => setV({ offerId: e.target.value })}>
                          <option value="">— nenhuma —</option>
                          {draft.offers.map((o) => {
                            const p = products.find((x) => x.id === o.productId);
                            return (
                              <option key={o.id} value={o.id}>
                                {(o.headline || p?.name || "Oferta") + (p ? ` · ${formatBRL(p.price)}` : "")}
                                {o.style === "call" ? " (chamada de vídeo)" : ""}
                              </option>
                            );
                          })}
                        </select>
                        {draft.offers.length === 0 && <p className="hint">Cadastre a oferta (ex.: chamada de vídeo) em Ofertas acima.</p>}
                      </div>
                      <div className="field">
                        <label>Mensagem no fim da ligação</label>
                        <input
                          className="input"
                          placeholder="Ex.: gostou de ouvir minha voz? 🥵 agora imagina me ver… faz uma chamada de vídeo comigo"
                          value={v.endText ?? ""}
                          onChange={(e) => setV({ endText: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => set("voiceCalls", (draft.voiceCalls ?? []).filter((_, j) => j !== i))}>
                        Remover ligação
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Prévias (fotos e vídeos)</h3>
                <div className="row">
                  <button className="btn btn-sm" disabled={!!imgBusy && imgBusy.startsWith("Enviando")} onClick={() => imagesRef.current?.click()}>
                    + Enviar fotos ou vídeos
                  </button>
                  <input ref={imagesRef} type="file" accept="image/*,video/mp4,video/webm" multiple hidden onChange={(e) => addImages(e.target.files)} />
                </div>
              </div>
              <p className="hint" style={{ marginTop: -6 }}>
                Fotos e vídeos curtos que a IA pode mandar quando o lead pedir uma prévia, uma provinha, uma foto ou um vídeo. Descreva cada um (o que
                mostra e quando usar): a IA escolhe o certo, manda no máximo um por resposta, não repete e depois puxa para a oferta. Dá para selecionar
                vários de uma vez. Vídeos: MP4, de preferência curtos e leves.
              </p>
              {imgBusy && <p className={imgBusy.startsWith("Enviando") ? "hint" : "error-text"}>{imgBusy}</p>}
              <div className="brain-images">
                {(draft.images ?? []).map((a, i) => (
                  <div key={a.id} className="brain-image">
                    {!a.url ? (
                      <div className="ph">sem arquivo</div>
                    ) : a.kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(a.url) ? (
                      <div className="brain-video">
                        <video src={a.url} muted playsInline preload="metadata" controls />
                        <span className="pill">▶ vídeo</span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" />
                    )}
                    <textarea
                      className="textarea"
                      rows={2}
                      placeholder="Ex.: prévia de lingerie vermelha — quando pedirem uma provinha"
                      value={a.when ?? ""}
                      onChange={(e) => setImage(i, { when: e.target.value })}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={() => set("images", (draft.images ?? []).filter((_, j) => j !== i))}>
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="row brain-actions">
              <button className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? "Salvando..." : "Salvar cérebro"}
              </button>
              {draft.id && (
                <button className="btn btn-ghost" onClick={remove}>
                  Excluir
                </button>
              )}
              {msg && <span className={msg.error ? "error-text" : "hint"}>{msg.text}</span>}
            </div>

            {saved && <TestChat key={saved.id} brain={saved} />}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
