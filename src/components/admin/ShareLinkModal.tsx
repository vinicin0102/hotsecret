// Link público do fluxo para leads e anúncios: copiar, UTMs prontas por canal e QR Code.
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/Modal";
import { withBase } from "@/lib/paths";

interface Props {
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  onClose: () => void;
}

// Parâmetros dinâmicos de cada plataforma ({{...}} / __...__ são preenchidos por ela)
const PRESETS: { key: string; label: string; utm: Record<string, string>; hint: string }[] = [
  {
    key: "meta",
    label: "Meta Ads (Facebook / Instagram)",
    utm: { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "{{campaign.name}}", utm_content: "{{ad.name}}", utm_term: "{{adset.name}}" },
    hint: "Cole no campo “Site” do anúncio. A Meta preenche campanha, conjunto e anúncio sozinha.",
  },
  {
    key: "tiktok",
    label: "TikTok Ads",
    utm: { utm_source: "tiktok", utm_medium: "cpc", utm_campaign: "__CAMPAIGN_NAME__", utm_content: "__CID_NAME__", utm_term: "__AID_NAME__" },
    hint: "Cole como URL de destino. O TikTok preenche os nomes da campanha e do anúncio.",
  },
  {
    key: "google",
    label: "Google Ads",
    utm: { utm_source: "google", utm_medium: "cpc", utm_campaign: "{campaignid}", utm_content: "{creative}", utm_term: "{keyword}" },
    hint: "Use como URL final (ou modelo de acompanhamento).",
  },
  {
    key: "bio",
    label: "Bio do Instagram",
    utm: { utm_source: "instagram", utm_medium: "bio" },
    hint: "Link fixo para a bio do perfil.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp / disparos",
    utm: { utm_source: "whatsapp", utm_medium: "mensagem" },
    hint: "Para listas, grupos e disparos.",
  },
];

function withUtm(base: string, utm: Record<string, string>) {
  // as chaves dinâmicas ({{...}}, {...}, __...__) não podem ser codificadas, senão a plataforma não as substitui
  const qs = Object.entries(utm)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${/[{}]|__/.test(v) ? v : encodeURIComponent(v)}`)
    .join("&");
  return qs ? `${base}?${qs}` : base;
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row" style={{ gap: 8 }}>
      <input className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 13 }} />
      <button
        className="btn btn-sm btn-primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            /* sem permissão de clipboard: o campo já fica selecionável */
          }
        }}
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}

export function ShareLinkModal({ slug, status, onClose }: Props) {
  const base = useMemo(() => (typeof window !== "undefined" ? `${window.location.origin}${withBase(`/f/${slug}`)}` : ""), [slug]);
  const [preset, setPreset] = useState("meta");
  const [custom, setCustom] = useState({ utm_source: "", utm_medium: "", utm_campaign: "" });
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (base) QRCode.toDataURL(base, { margin: 1, width: 320 }).then(setQr).catch(() => setQr(null));
  }, [base]);

  const current = PRESETS.find((p) => p.key === preset)!;

  return (
    <Modal title="Link do fluxo" onClose={onClose} width={640}>
      {status !== "PUBLISHED" && (
        <div className="sandbox-box" style={{ marginTop: 0, marginBottom: 14 }}>
          ⚠ Este fluxo ainda não está <b>publicado</b>. Visitantes verão “conversa indisponível” (e você, logado, verá só a pré-visualização
          simulada). Clique em <b>Publicar</b> no construtor antes de divulgar.
        </div>
      )}

      <div className="field">
        <label>Link para os leads</label>
        <CopyRow value={base} />
        <span className="hint">É este o link que você divulga. Cada visitante vira um lead, com origem e campanha registradas.</span>
      </div>

      <div className="section-title">Links para anúncios (com rastreamento UTM)</div>
      <div className="segmented" style={{ marginBottom: 10 }}>
        {PRESETS.map((p) => (
          <button key={p.key} className={preset === p.key ? "active" : ""} onClick={() => setPreset(p.key)}>
            {p.label}
          </button>
        ))}
        <button className={preset === "custom" ? "active" : ""} onClick={() => setPreset("custom")}>
          Personalizado
        </button>
      </div>
      {preset !== "custom" ? (
        <div className="field">
          <CopyRow value={withUtm(base, current.utm)} />
          <span className="hint">{current.hint}</span>
        </div>
      ) : (
        <>
          <div className="grid-2">
            {(["utm_source", "utm_medium", "utm_campaign"] as const).map((k) => (
              <div key={k} className="field">
                <label>{k}</label>
                <input className="input" value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <CopyRow value={withUtm(base, custom)} />
        </>
      )}
      <p className="hint">As vendas aparecem por campanha em Analytics → “Vendas por campanha”.</p>

      {qr && (
        <div className="row" style={{ marginTop: 14, alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code do link" style={{ width: 120, height: 120, borderRadius: 10, background: "#fff", padding: 6 }} />
          <div className="hint">
            QR Code do link (para stories, materiais impressos etc.).
            <br />
            <a href={qr} download={`hotsecret-${slug}.png`}>
              Baixar QR Code
            </a>
          </div>
        </div>
      )}

      <div className="modal-actions">
        <a className="btn btn-sm" href={withBase(`/f/${slug}`)} target="_blank" rel="noreferrer">
          Abrir o chat
        </a>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
