// Grupo VIP: dados do perfil (modelo, capa, bio, assinatura) e os posts — fotos/vídeos grátis, só VIP ou pagos à parte.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { UploadInput } from "@/components/admin/UploadInput";
import { useFetch } from "@/hooks/useFetch";
import { api, uploadFile } from "@/lib/client";
import { currencyOfLocale, asCurrency, formatDateTime, formatMoney, productOption, slugify } from "@/lib/format";
import { withBase } from "@/lib/paths";

type Access = "free" | "vip" | "paid";
interface Media {
  url: string;
  kind: "image" | "video";
  preview?: string;
}
interface Post {
  id: string;
  caption: string | null;
  media: Media[];
  access: Access;
  productId: string | null;
  pinned: boolean;
  publishedAt: string;
}
interface Group {
  id: string;
  name: string;
  slug: string;
  characterId: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  productId: string | null;
  locale: "pt-BR" | "es-MX" | "es-AR";
  published: boolean;
  settings: { headline?: string; perks?: string[]; ctaLabel?: string; anyPurchase?: boolean };
  posts: Post[];
}
interface Product {
  id: string;
  name: string;
  price: number;
  currency?: string;
  active: boolean;
}

const ACCESS: [Access, string, string][] = [
  ["free", "🌐 Grátis", "Todos veem — a isca do perfil"],
  ["vip", "💎 Só VIP", "Libera com a assinatura do grupo"],
  ["paid", "💰 Pago à parte", "Libera pagando o produto deste post (mesmo para assinantes)"],
];

export default function VipGroupEditor() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : null;
  const { data, reload } = useFetch<{ group: Group }>(id ? `/api/admin/vip/${id}` : null);
  const { data: prod } = useFetch<{ products: Product[] }>("/api/admin/products");
  const { data: chars } = useFetch<{ characters: { id: string; name: string; avatarUrl: string | null }[] }>("/api/admin/characters");
  const [g, setG] = useState<Group | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Post | "new" | null>(null);

  useEffect(() => {
    if (data?.group) setG((cur) => (cur && cur.id === data.group.id ? { ...cur, posts: data.group.posts } : data.group));
  }, [data]);

  if (!g) return <AdminLayout title="Grupo VIP">{error ? <p className="error-text">{error}</p> : <p className="hint">Carregando...</p>}</AdminLayout>;

  const currency = currencyOfLocale(g.locale);
  const products = (prod?.products ?? []).filter((p) => asCurrency(p.currency) === currency);
  const set = (patch: Partial<Group>) => {
    setG({ ...g, ...patch });
    setSaved("idle");
  };
  const save = async () => {
    setError(null);
    setSaved("saving");
    try {
      await api(`/api/admin/vip/${g.id}`, {
        method: "PUT",
        body: {
          name: g.name,
          slug: g.slug,
          characterId: g.characterId,
          bio: g.bio,
          avatarUrl: g.avatarUrl,
          coverUrl: g.coverUrl,
          productId: g.productId,
          locale: g.locale,
          published: g.published,
          settings: { headline: g.settings.headline ?? "", perks: g.settings.perks ?? [], ctaLabel: g.settings.ctaLabel ?? "", anyPurchase: g.settings.anyPurchase !== false },
        },
      });
      setSaved("saved");
    } catch (e) {
      setSaved("idle");
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };
  const removePost = async (p: Post) => {
    if (!confirm("Excluir este post?")) return;
    await api(`/api/admin/vip/${g.id}/posts/${p.id}`, { method: "DELETE" });
    void reload();
  };
  const sub = products.find((p) => p.id === g.productId);
  const productName = (pid: string | null) => {
    const p = prod?.products.find((x) => x.id === pid);
    return p ? `${p.name} · ${formatMoney(p.price, p.currency)}` : "produto não encontrado";
  };

  return (
    <AdminLayout
      title={g.name || "Grupo VIP"}
      subtitle={
        <>
          <Link href="/admin/vip">← Grupos VIP</Link> · /g/{g.slug} · {g.published ? "publicado" : "rascunho (só você vê)"}
        </>
      }
      actions={
        <div className="row">
          <a className="btn" href={withBase(`/g/${g.slug}`)} target="_blank" rel="noreferrer">
            Ver página ↗
          </a>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saved === "saving"}>
            {saved === "saving" ? "Salvando..." : saved === "saved" ? "Salvo ✓" : "Salvar"}
          </button>
        </div>
      }
    >
      {error && <p className="error-text">{error}</p>}
      <div className="vip-editor">
        <div className="card vip-settings">
          <div className="card-head">
            <h3>Perfil</h3>
            <label className="checkbox">
              <input type="checkbox" checked={g.published} onChange={(e) => set({ published: e.target.checked })} /> Publicado
            </label>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="vg-name">Nome</label>
              <input id="vg-name" className="input" value={g.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="vg-slug">Link (/g/…)</label>
              <input id="vg-slug" className="input" value={g.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="vg-model">Modelo</label>
            <select id="vg-model" className="select" value={g.characterId ?? ""} onChange={(e) => set({ characterId: e.target.value || null })}>
              <option value="">— nenhuma —</option>
              {chars?.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="hint">Sem foto de perfil própria, usa a foto da modelo.</span>
          </div>
          <div className="field">
            <label>Foto do perfil (opcional)</label>
            <UploadInput value={g.avatarUrl ?? ""} onChange={(avatarUrl) => set({ avatarUrl })} />
          </div>
          <div className="field">
            <label>Capa</label>
            <UploadInput value={g.coverUrl ?? ""} onChange={(coverUrl) => set({ coverUrl })} />
          </div>
          <div className="field">
            <label htmlFor="vg-bio">Bio</label>
            <textarea id="vg-bio" className="textarea" placeholder="Oi amor 😈 aqui eu posto o que não posso mostrar em nenhum outro lugar..." value={g.bio ?? ""} onChange={(e) => set({ bio: e.target.value })} />
          </div>
          <div className="field">
            <label>País (idioma da página e moeda)</label>
            <div className="segmented">
              {(
                [
                  ["pt-BR", "🇧🇷 Brasil · R$"],
                  ["es-MX", "🇲🇽 México · MXN"],
                  ["es-AR", "🇦🇷 Argentina · ARS"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" className={g.locale === v ? "active" : ""} onClick={() => set({ locale: v, productId: null })}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="section-title">Assinatura VIP</div>
          <label className="checkbox" style={{ marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={g.settings.anyPurchase !== false}
              onChange={(e) => set({ settings: { ...g.settings, anyPurchase: e.target.checked } })}
            />
            Liberar o VIP para quem comprou qualquer produto
          </label>
          <p className="hint" style={{ marginTop: 0 }}>
            Comprou qualquer coisa no chat, na chamada ou num upsell: entra no grupo já liberado. Depois do pagamento aparece no chat um card com o
            botão <b>Abrir meu VIP</b> (do grupo da mesma modelo do fluxo).
          </p>
          <div className="field">
            <label htmlFor="vg-prod">Produto da assinatura</label>
            <select id="vg-prod" className="select" value={g.productId ?? ""} onChange={(e) => set({ productId: e.target.value || null })}>
              <option value="">— sem assinatura (só posts grátis e pagos à parte) —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {productOption(p)} {p.active ? "" : "(inativo)"}
                </option>
              ))}
            </select>
            <span className="hint">
              Pagou, libera todos os posts <b>Só VIP</b>. Só aparecem produtos em {currency}. Produto vendido no chat com o link deste grupo como{" "}
              <b>link de entrega</b> também libera o VIP (o comprador entra já liberado).
            </span>
          </div>
          <div className="field">
            <label htmlFor="vg-head">Chamada do card</label>
            <input
              id="vg-head"
              className="input"
              placeholder="Entra no meu VIP e vê tudo sem censura 🔥"
              value={g.settings.headline ?? ""}
              onChange={(e) => set({ settings: { ...g.settings, headline: e.target.value } })}
            />
          </div>
          <div className="field">
            <label htmlFor="vg-perks">O que a assinatura inclui (um por linha)</label>
            <textarea
              id="vg-perks"
              className="textarea"
              placeholder={"Fotos e vídeos novos toda semana\nConteúdo que não posto em lugar nenhum"}
              value={(g.settings.perks ?? []).join("\n")}
              onChange={(e) => set({ settings: { ...g.settings, perks: e.target.value.split("\n") } })}
            />
          </div>
          <div className="field">
            <label htmlFor="vg-cta">Texto do botão</label>
            <input id="vg-cta" className="input" placeholder="ASSINAR VIP" value={g.settings.ctaLabel ?? ""} onChange={(e) => set({ settings: { ...g.settings, ctaLabel: e.target.value } })} />
          </div>
          {g.productId && !sub && <p className="error-text">O produto da assinatura não está disponível (inativo ou de outra moeda).</p>}
        </div>

        <div className="vip-posts">
          <div className="card">
            <div className="card-head">
              <h3>Posts ({g.posts.length})</h3>
              {editing === null && (
                <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
                  + Novo post
                </button>
              )}
            </div>
            {editing !== null && (
              <PostComposer
                key={editing === "new" ? "new" : editing.id}
                groupId={g.id}
                initial={editing === "new" ? null : editing}
                products={products}
                onDone={(changed) => {
                  setEditing(null);
                  if (changed) void reload();
                }}
              />
            )}
            {g.posts.length === 0 && editing === null && (
              <p className="hint">Nenhum post ainda. Comece com 1 ou 2 posts grátis (a isca) e depois os VIP e os pagos à parte.</p>
            )}
            <div className="vip-post-list">
              {g.posts.map((p) => (
                <div key={p.id} className="vip-post-row">
                  <div className="vip-post-thumbs">
                    {p.media.slice(0, 4).map((m, i) =>
                      m.kind === "video" ? (
                        <video key={i} src={`${m.url}#t=1`} muted playsInline preload="metadata" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={m.url} alt="" />
                      ),
                    )}
                    {p.media.length > 4 && <span className="vip-more">+{p.media.length - 4}</span>}
                    {p.media.length === 0 && <span className="vip-more">Aa</span>}
                  </div>
                  <div className="vip-post-info">
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      {p.pinned && <span className="pill">📌 Fixado</span>}
                      <span className={`pill vip-access-${p.access}`}>
                        {p.access === "free" ? "🌐 Grátis" : p.access === "vip" ? "💎 Só VIP" : `💰 ${productName(p.productId)}`}
                      </span>
                      <span className="hint">
                        {p.media.filter((m) => m.kind === "image").length} foto(s) · {p.media.filter((m) => m.kind === "video").length} vídeo(s) ·{" "}
                        {formatDateTime(p.publishedAt)}
                      </span>
                    </div>
                    {p.caption && <div className="vip-post-caption">{p.caption}</div>}
                  </div>
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => setEditing(p)} disabled={editing !== null}>
                      Editar
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => void removePost(p)}>
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

interface Item extends Partial<Media> {
  key: string;
  kind: "image" | "video";
  name?: string;
  /** enviando: porcentagem */
  pct?: number;
  error?: string;
}

/** novo post / editar post: legenda, fotos e vídeos (cada um com a prévia borrada) e quem pode ver */
function PostComposer({ groupId, initial, products, onDone }: { groupId: string; initial: Post | null; products: Product[]; onDone: (changed: boolean) => void }) {
  const [caption, setCaption] = useState(initial?.caption ?? "");
  const [items, setItems] = useState<Item[]>(() => (initial?.media ?? []).map((m, i) => ({ ...m, key: `m${i}` })));
  const [access, setAccess] = useState<Access>(initial?.access ?? "vip");
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploading = items.some((i) => i.pct !== undefined);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const addFiles = (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      const kind = f.type.startsWith("video/") ? ("video" as const) : ("image" as const);
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setItems((list) => [...list, { key, kind, name: f.name, pct: 0 }]);
      void (async () => {
        try {
          const { makeBlurPreview } = await import("@/lib/blur-preview");
          const [url, prev] = await Promise.all([
            uploadFile(f, (pct, stage) => patch(key, { pct: stage === "optimizing" ? Math.round(pct / 2) : 50 + Math.round(pct / 2) })),
            makeBlurPreview(f),
          ]);
          const preview = prev ? await uploadFile(prev, undefined, { optimize: false }).catch(() => undefined) : undefined;
          patch(key, { url, preview, pct: undefined });
        } catch (e) {
          patch(key, { pct: undefined, error: e instanceof Error ? e.message : "Falha no envio" });
        }
      })();
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const move = (key: string, d: -1 | 1) =>
    setItems((list) => {
      const i = list.findIndex((x) => x.key === key);
      const j = i + d;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const body = {
        caption,
        media: items.filter((i) => i.url).map((i) => ({ url: i.url, kind: i.kind, preview: i.preview ?? null })),
        access,
        productId: access === "paid" ? productId : null,
        pinned,
      };
      if (initial) await api(`/api/admin/vip/${groupId}/posts/${initial.id}`, { method: "PUT", body });
      else await api(`/api/admin/vip/${groupId}/posts`, { body });
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar o post");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vip-composer">
      <div className="field">
        <label htmlFor="vp-caption">Legenda</label>
        <textarea id="vp-caption" className="textarea" placeholder="Hoje acordei assim pensando em você 😈" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      <div className="field">
        <label>Fotos e vídeos</label>
        <div className="vip-media-grid">
          {items.map((i, idx) => (
            <div key={i.key} className={`vip-media-item ${i.error ? "err" : ""}`}>
              {i.url ? (
                i.kind === "video" ? (
                  <video src={`${i.url}#t=1`} muted playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.url} alt="" />
                )
              ) : (
                <div className="vip-media-wait">{i.error ? "⚠" : `${i.pct ?? 0}%`}</div>
              )}
              {i.kind === "video" && <span className="vip-media-kind">▶</span>}
              {i.url && !i.preview && <span className="vip-media-noprev" title="Sem prévia borrada: aparece só o cadeado enquanto bloqueado">sem prévia</span>}
              <div className="vip-media-tools">
                <button type="button" onClick={() => move(i.key, -1)} disabled={idx === 0} aria-label="Mover para antes">
                  ←
                </button>
                <button type="button" onClick={() => move(i.key, 1)} disabled={idx === items.length - 1} aria-label="Mover para depois">
                  →
                </button>
                <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} aria-label="Remover">
                  ✕
                </button>
              </div>
              {i.error && <div className="vip-media-error">{i.error}</div>}
            </div>
          ))}
          <button type="button" className="vip-media-add" onClick={() => fileRef.current?.click()}>
            <span>＋</span>
            Adicionar
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <span className="hint">Pode mandar várias de uma vez. Vídeos são otimizados no seu navegador antes de subir. A prévia borrada é gerada sozinha.</span>
      </div>
      <div className="field">
        <label>Quem pode ver</label>
        <div className="vip-access-pick">
          {ACCESS.map(([v, label, hint]) => (
            <button key={v} type="button" className={access === v ? "active" : ""} onClick={() => setAccess(v)}>
              <b>{label}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      </div>
      {access === "paid" && (
        <div className="field">
          <label htmlFor="vp-prod">Produto que libera este post</label>
          <select id="vp-prod" className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— selecione —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {productOption(p)} {p.active ? "" : "(inativo)"}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 📌 Fixar no topo do perfil
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={() => onDone(false)} disabled={busy}>
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={busy || uploading || (!caption.trim() && !items.some((i) => i.url)) || (access === "paid" && !productId)}
        >
          {uploading ? "Aguardando envio..." : busy ? "Salvando..." : initial ? "Salvar post" : "Publicar post"}
        </button>
      </div>
    </div>
  );
}
