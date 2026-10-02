import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { slugify } from "@/lib/format";
import { withBase } from "@/lib/paths";
import { DEFAULT_FUNNEL_DELAY, DEFAULT_RECOVERY, type FunnelDelay, type FunnelSettings, type RecoverySettings, type TrackingIds } from "@/types/flow";
import { DelayEditor } from "./DelayEditor";

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...m, settings: { ...(m.settings ?? {}), recovery, delay, tracking } });
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
