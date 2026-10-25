// Editor da vitrine: textos do topo e as modelos do carrossel (fluxo, foto, bio, destaques e estilo do chat).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UploadInput } from "@/components/admin/UploadInput";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { withBase } from "@/lib/paths";
import { slugify } from "@/lib/format";

type Chat = "default" | "messenger";
interface Item {
  id: string;
  funnelId: string;
  name?: string;
  photoUrl?: string;
  headline?: string;
  bio?: string;
  tags?: string[];
  chat?: Chat | null;
}
interface Showcase {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  subtitle: string | null;
  locale: string;
  published: boolean;
  items: Item[];
}
interface FunnelRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  settings: { appearance?: { theme?: string } } | null;
  character: { name: string; avatarUrl: string | null } | null;
}

const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const themeName = (t?: string) => (t === "messenger" ? "WhatsApp" : "Secret");

export default function ShowcaseEditor() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;
  const { data } = useFetch<{ showcase: Showcase }>(id ? `/api/admin/showcases/${id}` : null);
  const { data: fl } = useFetch<{ funnels: FunnelRow[] }>("/api/admin/funnels");
  const [s, setS] = useState<Showcase | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (data?.showcase) setS((cur) => cur ?? data.showcase);
  }, [data]);

  if (!s) return <AdminLayout title="Vitrine">{error ? <p className="error-text">{error}</p> : <p className="hint">Carregando...</p>}</AdminLayout>;

  const funnels = fl?.funnels ?? [];
  const funnelOf = (fid: string) => funnels.find((f) => f.id === fid);
  const set = (patch: Partial<Showcase>) => {
    setS({ ...s, ...patch });
    setSaved("idle");
  };
  const setItem = (i: number, patch: Partial<Item>) => set({ items: s.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= s.items.length) return;
    const items = [...s.items];
    [items[i], items[j]] = [items[j], items[i]];
    set({ items });
  };
  const add = () => {
    const used = new Set(s.items.map((i) => i.funnelId));
    const next = funnels.find((f) => f.status === "PUBLISHED" && !used.has(f.id)) ?? funnels[0];
    set({ items: [...s.items, { id: newId(), funnelId: next?.id ?? "", chat: null }] });
  };
  const save = async () => {
    setError(null);
    setSaved("saving");
    try {
      await api(`/api/admin/showcases/${s.id}`, {
        method: "PUT",
        body: {
          name: s.name,
          slug: s.slug,
          title: s.title,
          subtitle: s.subtitle,
          locale: s.locale,
          published: s.published,
          items: s.items.map((it) => ({ ...it, tags: (it.tags ?? []).map((t) => t.trim()).filter(Boolean), chat: it.chat || null })),
        },
      });
      setSaved("saved");
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setSaved("idle");
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  return (
    <AdminLayout
      title={s.name || "Vitrine"}
      subtitle={
        <>
          <Link href="/admin/vitrine">← Vitrines</Link> · /v/{s.slug} · {s.published ? "publicada" : "rascunho (só você vê)"}
        </>
      }
      actions={
        <div className="row">
          <a className="btn" href={withBase(`/v/${s.slug}`)} target="_blank" rel="noreferrer">
            Ver página ↗
          </a>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saved === "saving"}>
            {saved === "saving" ? "Salvando..." : saved === "saved" ? "Salvo ✓" : "Salvar"}
          </button>
        </div>
      }
    >
      {error && <p className="error-text">{error}</p>}
      <div className="sc-editor">
        <div className="sc-editor-main">
          <div className="card">
            <div className="card-head">
              <h3>Página</h3>
              <label className="checkbox">
                <input type="checkbox" checked={s.published} onChange={(e) => set({ published: e.target.checked })} /> Publicada
              </label>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="sc-name">Nome (só no painel)</label>
                <input id="sc-name" className="input" value={s.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="sc-slug">Link (/v/…)</label>
                <input id="sc-slug" className="input" value={s.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="sc-title">Título</label>
              <input id="sc-title" className="input" placeholder="Escolha com quem você quer conversar" value={s.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sc-sub">Subtítulo (opcional)</label>
              <input id="sc-sub" className="input" placeholder="Todas online agora, esperando você 💋" value={s.subtitle ?? ""} onChange={(e) => set({ subtitle: e.target.value })} />
            </div>
            <div className="field">
              <label>Idioma da página</label>
              <div className="segmented">
                {(
                  [
                    ["pt-BR", "🇧🇷 Português"],
                    ["es-MX", "🇲🇽 Espanhol (MX)"],
                    ["es-AR", "🇦🇷 Espanhol (AR)"],
                  ] as const
                ).map(([v, label]) => (
                  <button key={v} type="button" className={s.locale === v ? "active" : ""} onClick={() => set({ locale: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {s.items.map((it, i) => {
            const f = funnelOf(it.funnelId);
            return (
              <div key={it.id} className="card sc-model">
                <div className="card-head">
                  <h3>
                    {i + 1}. {it.name || f?.character?.name || f?.name || "Modelo"}
                  </h3>
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                      ↑
                    </button>
                    <button className="btn btn-sm" onClick={() => move(i, 1)} disabled={i === s.items.length - 1} aria-label="Descer">
                      ↓
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => set({ items: s.items.filter((_, j) => j !== i) })}>
                      Remover
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor={`sc-f-${it.id}`}>Fluxo (chat da modelo)</label>
                  <select id={`sc-f-${it.id}`} className="select" value={it.funnelId} onChange={(e) => setItem(i, { funnelId: e.target.value })}>
                    <option value="">— escolha o fluxo —</option>
                    {funnels.map((fx) => (
                      <option key={fx.id} value={fx.id}>
                        {fx.name}
                        {fx.character ? ` · ${fx.character.name}` : ""}
                        {fx.status === "PUBLISHED" ? "" : " (rascunho — não aparece para o lead)"}
                      </option>
                    ))}
                  </select>
                  {f && f.status !== "PUBLISHED" && <span className="error-text">Publique esse fluxo para a modelo aparecer na vitrine.</span>}
                </div>
                <div className="field">
                  <label>Estilo do chat</label>
                  <div className="segmented">
                    {(
                      [
                        [null, `Igual ao fluxo (${themeName(f?.settings?.appearance?.theme)})`],
                        ["default", "Chat Secret"],
                        ["messenger", "Chat WhatsApp"],
                      ] as const
                    ).map(([v, label]) => (
                      <button key={label} type="button" className={(it.chat ?? null) === v ? "active" : ""} onClick={() => setItem(i, { chat: v })}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="hint">Só muda o visual do chat quando o lead entra por esta vitrine — o fluxo continua igual.</span>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor={`sc-n-${it.id}`}>Nome no card</label>
                    <input id={`sc-n-${it.id}`} className="input" placeholder={f?.character?.name ?? "Nome da modelo"} value={it.name ?? ""} onChange={(e) => setItem(i, { name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor={`sc-h-${it.id}`}>O que ela faz (linha curta)</label>
                    <input id={`sc-h-${it.id}`} className="input" placeholder="Ex.: Modelo e criadora de conteúdo 🔥" value={it.headline ?? ""} onChange={(e) => setItem(i, { headline: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Foto do card (vertical fica melhor)</label>
                  <UploadInput value={it.photoUrl ?? ""} onChange={(photoUrl) => setItem(i, { photoUrl })} />
                  <span className="hint">Vazio: usa a foto da personagem do fluxo.</span>
                </div>
                <div className="field">
                  <label htmlFor={`sc-b-${it.id}`}>Biografia</label>
                  <textarea
                    id={`sc-b-${it.id}`}
                    className="textarea"
                    rows={3}
                    placeholder="Vazio: usa o recado da personagem. Ex.: 24 anos, de SP. Amo conversar até tarde e mandar áudio 😈"
                    value={it.bio ?? ""}
                    onChange={(e) => setItem(i, { bio: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`sc-t-${it.id}`}>Destaques (um por linha, até 6)</label>
                  <textarea
                    id={`sc-t-${it.id}`}
                    className="textarea"
                    rows={3}
                    placeholder={"📸 Fotos exclusivas\n🎥 Chamada de vídeo\n🎧 Áudios"}
                    value={(it.tags ?? []).join("\n")}
                    onChange={(e) => setItem(i, { tags: e.target.value.split("\n").slice(0, 6) })}
                  />
                </div>
              </div>
            );
          })}
          <button className="btn" onClick={add} disabled={funnels.length === 0}>
            + Adicionar modelo
          </button>
          {funnels.length === 0 && <p className="hint">Crie um fluxo para cada modelo em Fluxos antes de montar a vitrine.</p>}
        </div>
        <div className="sc-editor-preview">
          <div className="hint">Pré-visualização (salve para atualizar)</div>
          <iframe key={previewKey} title="Pré-visualização da vitrine" src={withBase(`/v/${s.slug}`)} />
        </div>
      </div>
    </AdminLayout>
  );
}
