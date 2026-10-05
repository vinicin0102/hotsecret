// Cérebro: chave da IA, personalidade, conteúdo, ofertas e áudios que a IA usa para conversar com os leads.
import { useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UploadInput } from "@/components/admin/UploadInput";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatBRL } from "@/lib/format";
import { shortId } from "@/features/chat-engine/engine";

interface AiSettings {
  configured: boolean;
  fromEnv: boolean;
  keyHint: string | null;
  model: string;
  models: { id: string; label: string }[];
}
interface Offer {
  id: string;
  productId: string;
  style?: "card" | "call";
  videoId?: string;
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
  offers: Offer[];
  audios: Audio[];
  maxReplies: number;
  fallbackMessage: string;
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
  offers: [],
  audios: [],
  maxReplies: 30,
  fallbackMessage: "",
};

function ConnectionCard() {
  const { data, reload } = useFetch<{ settings: AiSettings }>("/api/admin/ai-settings");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const s = data?.settings;

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

  if (!s) return <div className="card">Carregando...</div>;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Conexão com a IA</h3>
        <span className={`pill ${s.configured ? "status-PUBLISHED" : "status-ARCHIVED"}`}>
          {s.configured ? `Conectada · ${s.keyHint}` : "Sem chave"}
        </span>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        A IA usa o Claude, da Anthropic. Crie a chave em{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com → API Keys
        </a>{" "}
        (começa com <code className="inline">sk-ant-</code>). Ela fica guardada criptografada no servidor e nunca aparece no chat. O uso é cobrado
        pela Anthropic na sua conta.
      </p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="ai-key">{s.configured ? "Trocar chave da API" : "Chave da API"}</label>
          <input
            id="ai-key"
            className="input"
            type="password"
            autoComplete="off"
            placeholder={s.configured ? "Deixe vazio para manter a atual" : "sk-ant-..."}
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
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save({ ...(key.trim() ? { apiKey: key.trim() } : {}), model: model || s.model }, "Salvo ✓")}>
          Salvar
        </button>
        <button className="btn btn-sm" disabled={busy || !s.configured} onClick={test}>
          Testar conexão
        </button>
        {s.configured && !s.fromEnv && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => confirm("Remover a chave da API?") && save({ apiKey: null }, "Chave removida")}>
            Remover chave
          </button>
        )}
        {msg && <span className={msg.error ? "error-text" : "hint"}>{msg.text}</span>}
      </div>
    </div>
  );
}

function TestChat({ brain }: { brain: Brain }) {
  const [history, setHistory] = useState<{ role: "lead" | "bot"; text: string; audio?: string; offer?: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        offer: { name: string; price: number; headline: string; style?: string } | null;
        end: boolean;
      }>(`/api/admin/brains/${brain.id}/test`, {
        body: {
          history: next.map((h) => ({ role: h.role, text: h.audio ? "[enviou um áudio]" : h.offer ? `[mostrou o card da oferta ${h.offer}]` : h.text })),
        },
      });
      const bot = [
        ...r.messages.map((m) => ({ role: "bot" as const, text: m })),
        ...(r.audio ? [{ role: "bot" as const, text: r.audio.when ?? "", audio: r.audio.url }] : []),
        ...(r.offer
          ? [{ role: "bot" as const, text: "", offer: `${r.offer.style === "call" ? "📹 Ligação" : "🛒 Oferta"}: ${r.offer.headline} · ${formatBRL(r.offer.price)}` }]
          : []),
        ...(r.end ? [{ role: "bot" as const, text: "— a IA encerrou a conversa —" }] : []),
      ];
      setHistory([...next, ...bot]);
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
        <button className="btn btn-ghost btn-sm" onClick={() => setHistory([])}>
          Limpar
        </button>
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
            {h.audio ? (
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
            setDraft({ ...EMPTY, offers: [], audios: [] });
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
                {b.active ? "ativo" : "inativo"} · {b.offers.length} oferta(s) · {b.audios.length} áudio(s)
              </small>
            </button>
          ))}
          <p className="hint" style={{ marginTop: 12 }}>
            Para usar, coloque o bloco <b>🧠 Cérebro (IA)</b> no fluxo e escolha o cérebro.
          </p>
        </div>

        {draft && (
          <div className="brain-editor">
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
                        ] as const
                      ).map(([s, label]) => (
                        <button key={s} type="button" className={(o.style ?? "card") === s ? "active" : ""} onClick={() => setOffer(i, { style: s })}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
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
                      <p className="hint">
                        Quando a IA escolher esta oferta, o lead recebe a ligação (foto, toque e vibração). Atender abre um pop-up só com o código PIX;
                        Recusar abre o mesmo pop-up com o downsell. O vídeo só começa depois do pagamento aprovado.
                      </p>
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
