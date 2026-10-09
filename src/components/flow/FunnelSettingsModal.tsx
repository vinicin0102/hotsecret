import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { slugify } from "@/lib/format";
import { withBase } from "@/lib/paths";
import {
  DEFAULT_FUNNEL_DELAY,
  DEFAULT_RECOVERY,
  type FunnelDelay,
  type ChatAppearance,
  type FunnelSettings,
  type LivePreview,
  type LiveSettings,
  type RecoverySettings,
  type TrackingIds,
} from "@/types/flow";
import { DelayEditor } from "./DelayEditor";
import { UploadInput } from "@/components/admin/UploadInput";

export interface FunnelMeta {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  characterId: string | null;
  initialMessage: string | null;
  settings: FunnelSettings;
}

export function FunnelSettingsModal({
  meta,
  characters,
  onClose,
  onSave,
  onApplyDelayToAll,
}: {
  meta: FunnelMeta;
  characters: { id: string; name: string }[];
  onClose: () => void;
  onSave: (m: FunnelMeta) => Promise<void>;
  /** faz todas as mensagens existentes usarem o atraso padrão do fluxo */
  onApplyDelayToAll?: () => number;
}) {
  const [m, setM] = useState<FunnelMeta>(meta);
  const [delay, setDelay] = useState<FunnelDelay>({ ...DEFAULT_FUNNEL_DELAY, ...(meta.settings?.delay ?? {}) });
  const [applied, setApplied] = useState<number | null>(null);
  const [tracking, setTracking] = useState<TrackingIds>({ ...(meta.settings?.tracking ?? {}) });
  const [recovery, setRecovery] = useState<RecoverySettings>({ ...DEFAULT_RECOVERY, ...(meta.settings?.recovery ?? {}) });
  const [appearance, setAppearance] = useState<ChatAppearance>({ bgDim: 35, ...(meta.settings?.appearance ?? {}) });
  const [locale, setLocale] = useState<"pt-BR" | "es-MX" | "es-AR">(
    meta.settings?.locale === "es-MX" || meta.settings?.locale === "es-AR" ? meta.settings.locale : "pt-BR",
  );
  const [live, setLive] = useState<LiveSettings>({ ...(meta.settings?.live ?? {}) });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setPreview = (i: number, patch: Partial<LivePreview>) =>
    setLive((l) => ({ ...l, previews: (l.previews ?? []).map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const movePreview = (i: number, d: -1 | 1) =>
    setLive((l) => {
      const list = [...(l.previews ?? [])];
      const j = i + d;
      if (j < 0 || j >= list.length) return l;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...l, previews: list };
    });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const cleanLive: LiveSettings = { ...live, previews: (live.previews ?? []).filter((p) => p.url) };
      await onSave({ ...m, settings: { ...(m.settings ?? {}), recovery, delay, tracking, appearance, locale, live: cleanLive } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Configurações do fluxo" onClose={onClose} width={620}>
      <div className="grid-2">
        <div className="field">
          <label>Nome</label>
          <input className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="select" value={m.status} onChange={(e) => setM({ ...m, status: e.target.value as FunnelMeta["status"] })}>
            <option value="DRAFT">Rascunho</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Descrição</label>
        <input className="input" value={m.description ?? ""} onChange={(e) => setM({ ...m, description: e.target.value })} />
      </div>
      <div className="field">
        <label>URL personalizada</label>
        <div className="row">
          <span className="dim" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
            {withBase("/f/")}
          </span>
          <input className="input" value={m.slug} onChange={(e) => setM({ ...m, slug: slugify(e.target.value) })} />
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Personagem</label>
          <select className="select" value={m.characterId ?? ""} onChange={(e) => setM({ ...m, characterId: e.target.value || null })}>
            <option value="">— nenhum —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Mensagem inicial (referência)</label>
          <input className="input" value={m.initialMessage ?? ""} onChange={(e) => setM({ ...m, initialMessage: e.target.value })} />
        </div>
      </div>

      <div className="section-title">País</div>
      <div className="field">
        <div className="segmented">
          {(
            [
              ["pt-BR", "🇧🇷 Brasil — português, R$"],
              ["es-MX", "🇲🇽 México — espanhol, MXN"],
              ["es-AR", "🇦🇷 Argentina — espanhol, ARS"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" className={locale === v ? "active" : ""} onClick={() => setLocale(v)}>
              {label}
            </button>
          ))}
        </div>
        <span className="hint">
          {locale === "es-MX"
            ? "As telas do chat ficam em espanhol e a IA responde em espanhol do México. Use nas ofertas produtos com moeda MXN (Produtos → Moeda). Mensagens, botões e textos que você escreve nos blocos e no cérebro aparecem como você escreveu — escreva-os em espanhol."
            : locale === "es-AR"
              ? "As telas do chat ficam em espanhol (com voseo) e a IA responde em espanhol da Argentina. Use nas ofertas produtos com moeda ARS (Produtos → Moeda). Escreva os textos dos blocos e do cérebro em espanhol."
              : "Chat e IA em português, preços em reais."}
        </span>
      </div>

      <div className="section-title">🔴 Canal VIP AO VIVO</div>
      <label className="checkbox" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={!!live.enabled} onChange={(e) => setLive((l) => ({ ...l, enabled: e.target.checked }))} />
        Ligar o modo Canal VIP AO VIVO neste fluxo
      </label>
      <p className="hint" style={{ marginTop: 0 }}>
        Quem clica no anúncio cai numa <b>chamada de vídeo recebida</b>. Ao atender, abre o chat com cara de live (nome, idade e cidade no topo, vídeo de
        fundo acima). Quando o lead pede prévia/provinha, aparece o botão <b>Ver Prévia</b> que libera as prévias abaixo uma por uma. Para vender, use no
        bloco Oferta (ou no Cérebro) o formato <b>🔴 Canal VIP AO VIVO</b>.
      </p>
      {live.enabled && (
        <>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="fp-age">Idade</label>
              <input
                id="fp-age"
                className="input"
                type="number"
                min={18}
                max={99}
                placeholder="ex.: 22"
                value={live.age ?? ""}
                onChange={(e) => setLive((l) => ({ ...l, age: e.target.value ? Math.max(18, Math.min(99, Number(e.target.value) || 18)) : undefined }))}
              />
            </div>
            <div className="field">
              <label htmlFor="fp-city">Cidade</label>
              <input id="fp-city" className="input" placeholder="vazio = a mesma cidade do lead" value={live.city ?? ""} onChange={(e) => setLive((l) => ({ ...l, city: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="fp-ring">Frase da tela de ligação</label>
            <input
              id="fp-ring"
              className="input"
              placeholder="padrão: {nome} quer uma conversa com você..."
              value={live.ringText ?? ""}
              onChange={(e) => setLive((l) => ({ ...l, ringText: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Prévias (na ordem em que são liberadas)</label>
            {(live.previews ?? []).map((p, i) => (
              <div key={p.id} className="brain-row" style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <b>Prévia {i + 1}</b>
                  <div className="row">
                    <select className="select" style={{ width: "auto" }} value={p.kind} onChange={(e) => setPreview(i, { kind: e.target.value as LivePreview["kind"] })}>
                      <option value="image">📷 Foto</option>
                      <option value="video">🎬 Vídeo</option>
                      <option value="audio">🎧 Áudio</option>
                    </select>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => movePreview(i, -1)} disabled={i === 0} aria-label="Subir">
                      ↑
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => movePreview(i, 1)} disabled={i === (live.previews ?? []).length - 1} aria-label="Descer">
                      ↓
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLive((l) => ({ ...l, previews: (l.previews ?? []).filter((_, j) => j !== i) }))}>
                      Remover
                    </button>
                  </div>
                </div>
                <UploadInput
                  value={p.url}
                  onChange={(url) => setPreview(i, { url, ...(/\.(mp4|webm|mov)(\?|$)/i.test(url) ? { kind: "video" } : /\.(mp3|m4a|ogg|wav|aac|opus)(\?|$)/i.test(url) ? { kind: "audio" } : {}) })}
                  accept={p.kind === "video" ? "video/*" : p.kind === "audio" ? "audio/*" : "image/*"}
                />
                <input
                  className="input"
                  style={{ marginTop: 6 }}
                  placeholder="Legenda (ex.: olha como eu sou safadinha... quer ver mais? vem pro VIP 💋)"
                  value={p.caption ?? ""}
                  onChange={(e) => setPreview(i, { caption: e.target.value })}
                />
              </div>
            ))}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                setLive((l) => ({ ...l, previews: [...(l.previews ?? []), { id: `lp_${Date.now().toString(36)}`, kind: "image", url: "", caption: "" }] }))
              }
              disabled={(live.previews ?? []).length >= 20}
            >
              + Adicionar prévia
            </button>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="fp-pbtn">Texto do botão</label>
              <input id="fp-pbtn" className="input" placeholder="Ver Prévia" value={live.previewButton ?? ""} onChange={(e) => setLive((l) => ({ ...l, previewButton: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="fp-pfoot">Rodapé das prévias</label>
              <input
                id="fp-pfoot"
                className="input"
                placeholder="No VIP eu mostro tudo sem limites 💋"
                value={live.previewFooter ?? ""}
                onChange={(e) => setLive((l) => ({ ...l, previewFooter: e.target.value }))}
              />
            </div>
          </div>
          <p className="hint">Dica: suba um vídeo de fundo (abaixo) para o chat ficar com cara de live.</p>
        </>
      )}

      <div className="section-title">Tempo entre mensagens</div>
      <p className="hint" style={{ marginTop: -4 }}>
        Quanto tempo o personagem fica “digitando...” antes de cada mensagem aparecer. Vale para todos os blocos marcados como
        “Padrão do fluxo”.
      </p>
      <DelayEditor value={delay} onChange={(v) => setDelay({ mode: v.mode === "inherit" ? "auto" : v.mode, ms: v.ms, minMs: v.minMs, maxMs: v.maxMs })} />
      {onApplyDelayToAll && (
        <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-sm" onClick={() => setApplied(onApplyDelayToAll())}>
            Usar este padrão em todas as mensagens existentes
          </button>
          {applied != null && <span className="hint">✓ {applied} bloco(s) atualizados — salve o fluxo para manter.</span>}
        </div>
      )}

      <div className="section-title">Vídeo de fundo</div>
      <p className="hint" style={{ marginTop: -4 }}>
        Toca em loop, sem som, atrás da conversa. Com vídeo, os balões ficam transparentes (efeito vidro). Use MP4 leve (até ~10 MB) para carregar
        rápido no celular.
      </p>
      <div className="field">
        <UploadInput value={appearance.bgVideoUrl ?? ""} onChange={(url) => setAppearance((a) => ({ ...a, bgVideoUrl: url }))} accept="video/mp4,video/webm" />
      </div>
      {appearance.bgVideoUrl && (
        <div className="field">
          <label htmlFor="fp-dim">Escurecer o vídeo: {appearance.bgDim ?? 35}%</label>
          <input
            id="fp-dim"
            type="range"
            min={0}
            max={90}
            step={5}
            value={appearance.bgDim ?? 35}
            onChange={(e) => setAppearance((a) => ({ ...a, bgDim: Number(e.target.value) }))}
          />
        </div>
      )}
      {appearance.bgVideoUrl && (
        <>
          <p className="hint">Com vídeo de fundo, a conversa começa de baixo para cima e deixa a parte de cima livre para o vídeo.</p>
          <label className="checkbox">
            <input type="checkbox" checked={appearance.fadeOld !== false} onChange={(e) => setAppearance((a) => ({ ...a, fadeOld: e.target.checked }))} />
            Mensagens antigas vão sumindo
          </label>
          {appearance.fadeOld !== false && (
            <div className="field">
              <label htmlFor="fp-visible">Mensagens que ficam na tela: {appearance.visibleCount ?? 5}</label>
              <input
                id="fp-visible"
                type="range"
                min={2}
                max={12}
                value={appearance.visibleCount ?? 5}
                onChange={(e) => setAppearance((a) => ({ ...a, visibleCount: Number(e.target.value) }))}
              />
              <p className="hint">A oferta ainda não comprada e o PIX pendente não somem.</p>
            </div>
          )}
        </>
      )}

      <div className="section-title">Pixels deste fluxo</div>
      <p className="hint" style={{ marginTop: -4 }}>
        Deixe vazio para usar os pixels padrão (Configurações → Pixels e rastreamento). Preencha só se este fluxo usa outra conta de anúncios.
      </p>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="fp-meta">Pixel da Meta</label>
          <input id="fp-meta" className="input" inputMode="numeric" placeholder="padrão" value={tracking.metaPixelId ?? ""} onChange={(e) => setTracking({ ...tracking, metaPixelId: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="fp-tiktok">Pixel do TikTok</label>
          <input id="fp-tiktok" className="input" placeholder="padrão" value={tracking.tiktokPixelId ?? ""} onChange={(e) => setTracking({ ...tracking, tiktokPixelId: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="fp-google">Google (GA4 / Ads)</label>
        <input id="fp-google" className="input" placeholder="padrão" value={tracking.googleTagId ?? ""} onChange={(e) => setTracking({ ...tracking, googleTagId: e.target.value })} />
      </div>

      <div className="section-title">Recuperação de checkout</div>
      <label className="checkbox" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={recovery.enabled} onChange={(e) => setRecovery({ ...recovery, enabled: e.target.checked })} />
        Se o checkout foi iniciado e o pagamento não foi aprovado, enviar mensagem automática
      </label>
      {recovery.enabled && (
        <>
          <div className="grid-2">
            <div className="field">
              <label>Enviar após (minutos)</label>
              <input
                className="input"
                type="number"
                min={1}
                value={recovery.delayMinutes}
                onChange={(e) => setRecovery({ ...recovery, delayMinutes: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div className="field">
              <label>Texto do botão</label>
              <input className="input" value={recovery.buttonLabel} onChange={(e) => setRecovery({ ...recovery, buttonLabel: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Mensagem</label>
            <textarea className="textarea" value={recovery.message} onChange={(e) => setRecovery({ ...recovery, message: e.target.value })} />
            <span className="hint">
              A mensagem aparece no chat do visitante (aberto ou quando ele voltar) e o lead recebe a tag ABANDONO. O botão reabre o checkout.
            </span>
          </div>
        </>
      )}

      {error && <div className="error-text">{error}</div>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
