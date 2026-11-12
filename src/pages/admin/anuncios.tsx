// Anúncios (estilo UTMify): gasto das contas de anúncios da Meta × vendas do sistema — ROAS, lucro, CPA,
// por campanha → conjunto → anúncio, e os produtos vendidos.
import { Fragment, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AnalyticsCard } from "@/components/admin/AnalyticsCard";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/format";
import type { AdNode, AdsReport, Money } from "@/services/ads/report";

type Report = AdsReport & { syncErrors: { account: string; error: string }[] };
interface Settings {
  accounts: { id: string; name: string; currency: string }[];
  tokenConfigured: boolean;
  tokenHint: string;
  feePercent: number;
  taxPercent: number;
  feeFixed: number;
  lastSyncAt: string | null;
}

const RANGES: [string, string][] = [
  ["today", "Hoje"],
  ["yesterday", "Ontem"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["month", "Este mês"],
  ["custom", "Personalizado"],
];
/** parâmetros de URL dos anúncios (padrão UTMify): ligam cada venda à campanha, ao conjunto e ao anúncio */
const URL_PARAMS =
  "utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}";

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const num = (v: number) => v.toLocaleString("pt-BR");

export default function AdsPage() {
  const [range, setRange] = useState("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [account, setAccount] = useState("");
  const q = new URLSearchParams({ range, ...(range === "custom" ? custom : {}), ...(account ? { account } : {}) }).toString();
  const ready = range !== "custom" || (!!custom.from && !!custom.to);
  const { data, error, loading, reload } = useFetch<Report>(ready ? `/api/admin/ads/report?${q}` : null);
  const { data: settings, reload: reloadSettings } = useFetch<Settings>("/api/admin/ads/settings");
  const [showSetup, setShowSetup] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const connected = !!settings?.accounts.length;
  const cur = data?.currency ?? "BRL";
  const m = (v: number) => formatMoney(v, cur);
  /** faturamento na moeda da conta (o ROAS e o lucro usam ele); outras moedas aparecem ao lado */
  const inCur = (r: Money) => r[cur] ?? 0;
  const others = (r: Money) =>
    Object.entries(r)
      .filter(([c, v]) => c !== cur && v > 0)
      .map(([c, v]) => formatMoney(v, c))
      .join(" + ");

  const syncNow = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const r = await api<{ rows: number; errors: { account: string; error: string }[] }>("/api/admin/ads/sync", { body: { range, ...(range === "custom" ? custom : {}) } });
      setMsg(r.errors.length ? { text: r.errors.map((e) => `${e.account}: ${e.error}`).join(" · "), error: true } : { text: "Gasto atualizado com a Meta ✓" });
      await reload();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro ao atualizar", error: true });
    } finally {
      setSyncing(false);
    }
  };

  const t = data?.totals;
  const rev = t ? inCur(t.revenue) : 0;
  const roas = t && t.spend ? rev / t.spend : 0;

  return (
    <AdminLayout
      title="Anúncios"
      subtitle="Gasto das contas de anúncios × vendas: ROAS, lucro e o que cada campanha vende"
      actions={
        <>
          {connected && settings!.accounts.length > 1 && (
            <select className="select" style={{ width: 200 }} value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Conta de anúncios">
              <option value="">Todas as contas</option>
              {settings!.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.id}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-sm" onClick={() => setShowSetup((v) => !v)}>
            ⚙ Contas e custos
          </button>
          {connected && (
            <button className="btn btn-sm" onClick={() => void syncNow()} disabled={syncing}>
              {syncing ? "Atualizando..." : "↻ Atualizar agora"}
            </button>
          )}
        </>
      }
    >
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
        <div className="segmented">
          {RANGES.map(([k, l]) => (
            <button key={k} className={range === k ? "active" : ""} onClick={() => setRange(k)}>
              {l}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="row">
            <input type="date" className="input" style={{ width: 150 }} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span className="dim">até</span>
            <input type="date" className="input" style={{ width: 150 }} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        )}
        {loading && <span className="dim">Carregando...</span>}
      </div>

      {msg && <div className={msg.error ? "error-text" : "check-ok"} style={{ marginBottom: 10 }}>{msg.text}</div>}
      {data?.syncErrors.length ? (
        <div className="error-text" style={{ marginBottom: 10 }}>
          A Meta recusou: {data.syncErrors.map((e) => `${e.account} — ${e.error}`).join(" · ")}
        </div>
      ) : null}
      {error && <div className="error-text">{error}</div>}

      {(showSetup || (settings && !connected)) && settings && (
        <SetupCard
          settings={settings}
          onSaved={async () => {
            // a 1ª conta conectada: o quadro continua aberto para mostrar o resultado
            setShowSetup(true);
            await reloadSettings();
            await reload();
          }}
        />
      )}

      {t && (
        <>
          <div className="stats-grid ads-stats">
            <AnalyticsCard label="Gasto em anúncios" value={m(t.spend)} hint={t.clicks ? `${num(t.clicks)} cliques · CPC ${m(Math.round(t.spend / t.clicks))}` : undefined} />
            <AnalyticsCard label="Faturamento" value={m(rev)} gold hint={others(t.revenue) ? `+ ${others(t.revenue)}` : `${num(t.sales)} venda${t.sales === 1 ? "" : "s"}`} />
            <AnalyticsCard
              label="Lucro"
              value={<span className={t.profit >= 0 ? "ads-pos" : "ads-neg"}>{m(t.profit)}</span>}
              hint={t.fees ? `taxas e impostos: ${m(t.fees)}` : t.spend ? `ROI ${pct(t.profit / t.spend)}` : undefined}
            />
            <AnalyticsCard label="ROAS" value={<span className={roasClass(roas, t.spend)}>{t.spend ? roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</span>} hint="faturamento ÷ gasto" />
            <AnalyticsCard label="Vendas" value={num(t.sales)} hint={t.checkouts ? `${num(t.checkouts)} PIX gerados · ${pct(t.sales / t.checkouts)} pagos` : undefined} />
            <AnalyticsCard label="Custo por venda (CPA)" value={t.sales && t.spend ? m(Math.round(t.spend / t.sales)) : "—"} hint={t.sales ? `ticket médio ${m(Math.round(rev / t.sales))}` : undefined} />
            <AnalyticsCard label="Leads" value={num(t.leads)} hint={t.leads && t.spend ? `custo por lead ${m(Math.round(t.spend / t.leads))} · ${pct(t.sales / t.leads)} compram` : undefined} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Campanhas</h3>
            <p className="hint" style={{ marginTop: -6 }}>
              Toque numa campanha para ver os conjuntos, e num conjunto para ver os anúncios. As vendas entram pelo dia do pagamento; o anúncio vem das
              UTMs do link.
            </p>
            {data.campaigns.length ? <CampaignTable data={data} /> : <div className="empty">Sem gasto nem vendas com campanha no período.</div>}
          </div>

          <div className="settings-grid ads-grid" style={{ marginBottom: 16 }}>
            <div className="card">
              <h3>Produtos vendidos</h3>
              {data.products.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Vendas</th>
                        <th>Faturamento</th>
                        <th>% do total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p) => (
                        <tr key={p.name}>
                          <td className="strong">{p.name}</td>
                          <td>{num(p.sales)}</td>
                          <td className="gold">{moneyAll(p.revenue, cur)}</td>
                          <td>{rev ? pct(inCur(p.revenue) / rev) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">Nenhuma venda no período.</div>
              )}
            </div>
            <div className="card">
              <h3>Vendas sem campanha identificada</h3>
              <p className="hint" style={{ marginTop: -6 }}>Lead sem UTM de campanha (link sem parâmetros, orgânico, direto). Coloque os parâmetros abaixo nos anúncios para elas entrarem nas campanhas.</p>
              {data.untracked.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Origem</th>
                        <th>Vendas</th>
                        <th>Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.untracked.map((u) => (
                        <tr key={u.source}>
                          <td>{u.source}</td>
                          <td>{num(u.sales)}</td>
                          <td className="gold">{moneyAll(u.revenue, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">Todas as vendas vieram de campanhas ✓</div>
              )}
            </div>
          </div>

          {data.days.length > 1 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>Dia a dia</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Gasto</th>
                      <th>Vendas</th>
                      <th>Faturamento</th>
                      <th>Lucro bruto</th>
                      <th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => {
                      const r = inCur(d.revenue);
                      return (
                        <tr key={d.day}>
                          <td>{d.day.split("-").reverse().join("/")}</td>
                          <td>{m(d.spend)}</td>
                          <td>{num(d.sales)}</td>
                          <td className="gold">{m(r)}</td>
                          <td className={r - d.spend >= 0 ? "ads-pos" : "ads-neg"}>{m(r - d.spend)}</td>
                          <td className={roasClass(d.spend ? r / d.spend : 0, d.spend)}>{d.spend ? (r / d.spend).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

function roasClass(roas: number, spend: number) {
  if (!spend) return "";
  return roas >= 2 ? "ads-pos" : roas >= 1 ? "ads-mid" : "ads-neg";
}

function moneyAll(r: Money, main: string) {
  const parts = Object.entries(r)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => Number(b === main) - Number(a === main))
    .map(([c, v]) => formatMoney(v, c));
  return parts.length ? parts.join(" + ") : "—";
}

/** campanha → conjuntos → anúncios, com gasto, vendas, faturamento, lucro, ROAS e CPA de cada um */
function CampaignTable({ data }: { data: Report }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const cur = data.currency;
  const toggle = (k: string) => setOpen((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const row = (n: AdNode, depth: number, expandable: boolean) => {
    const rev = n.revenue[cur] ?? 0;
    const roas = n.spend ? rev / n.spend : 0;
    return (
      <tr key={n.key} className={expandable ? "clickable" : ""} onClick={expandable ? () => toggle(n.key) : undefined}>
        <td className="ads-name" style={{ paddingLeft: 12 + depth * 18 }} title={n.id ? `${n.name} (${n.id})` : n.name}>
          {expandable ? (open.has(n.key) ? "▾ " : "▸ ") : depth ? "· " : ""}
          {n.name || "(sem nome)"}
        </td>
        <td>{formatMoney(n.spend, cur)}</td>
        <td>{n.sales}</td>
        <td className="gold">{moneyAll(n.revenue, cur)}</td>
        <td className={rev - n.spend >= 0 ? "ads-pos" : "ads-neg"}>{formatMoney(rev - n.spend, cur)}</td>
        <td className={roasClass(roas, n.spend)}>{n.spend ? roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
        <td>{n.sales && n.spend ? formatMoney(Math.round(n.spend / n.sales), cur) : "—"}</td>
        <td>{n.leads}</td>
        <td>{n.checkouts}</td>
        <td>{n.clicks || "—"}</td>
      </tr>
    );
  };
  return (
    <div className="table-wrap">
      <table className="table ads-table">
        <thead>
          <tr>
            <th>Campanha / conjunto / anúncio</th>
            <th>Gasto</th>
            <th>Vendas</th>
            <th>Faturamento</th>
            <th>Lucro bruto</th>
            <th>ROAS</th>
            <th>CPA</th>
            <th>Leads</th>
            <th>PIX</th>
            <th>Cliques</th>
          </tr>
        </thead>
        <tbody>
          {data.campaigns.map((c) => (
            <Fragment key={c.key}>
              {row(c, 0, c.adsets.length > 0)}
              {open.has(c.key) &&
                c.adsets.map((s) => (
                  <Fragment key={s.key}>
                    {row(s, 1, s.ads.length > 0)}
                    {open.has(s.key) && s.ads.map((a) => row(a, 2, false))}
                  </Fragment>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** conectar contas (token ads_read + IDs), custos do lucro e os parâmetros de URL para os anúncios */
function SetupCard({ settings, onSaved }: { settings: Settings; onSaved: () => Promise<void> }) {
  const [token, setToken] = useState("");
  const [removeToken, setRemoveToken] = useState(false);
  const [accounts, setAccounts] = useState(settings.accounts.map((a) => a.id).join("\n"));
  const [fee, setFee] = useState(String(settings.feePercent || ""));
  const [tax, setTax] = useState(String(settings.taxPercent || ""));
  const [fixed, setFixed] = useState(settings.feeFixed ? (settings.feeFixed / 100).toFixed(2).replace(".", ",") : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const toNum = (v: string) => Number(v.replace(",", ".")) || 0;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; problems: string[]; accounts: { id: string; name: string; currency: string }[] }>("/api/admin/ads/settings", {
        method: "PUT",
        body: {
          accounts: accounts.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
          ...(removeToken ? { token: "" } : token.trim() ? { token: token.trim() } : {}),
          feePercent: toNum(fee),
          taxPercent: toNum(tax),
          feeFixed: Math.round(toNum(fixed) * 100),
        },
      });
      setToken("");
      setMsg(
        r.ok
          ? { text: `Salvo ✓ ${r.accounts.map((a) => `${a.name} (${a.currency})`).join(", ")}` }
          : { text: `Salvo, mas: ${r.problems.join(" · ")}`, error: true },
      );
      await onSaved();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Erro ao salvar", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Conectar contas de anúncios (Meta)</h3>
      <p className="hint" style={{ marginTop: -6 }}>
        O gasto vem da API de Marketing da Meta, só leitura. Gere um token com a permissão <b>ads_read</b>: Gerenciador de Negócios → Configurações →
        Usuários → <b>Usuários do sistema</b> → adicionar (Admin) → <b>Atribuir ativos</b> (as contas de anúncios) → <b>Gerar token</b> com ads_read.
        O token fica só no servidor, criptografado.
      </p>
      <div className="settings-grid" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="ads-token">Token de acesso</label>
          <input
            id="ads-token"
            className="input"
            type="password"
            autoComplete="off"
            placeholder={settings.tokenConfigured && !removeToken ? `Configurado (${settings.tokenHint}) — cole outro para trocar` : "Cole o token aqui"}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setRemoveToken(false);
            }}
          />
          {settings.tokenConfigured && (
            <label className="checkbox" style={{ display: "inline-flex", marginTop: 6 }}>
              <input type="checkbox" checked={removeToken} onChange={(e) => setRemoveToken(e.target.checked)} /> remover token
            </label>
          )}
        </div>
        <div className="field">
          <label htmlFor="ads-accounts">Contas de anúncios (uma por linha)</label>
          <textarea id="ads-accounts" className="textarea" rows={3} placeholder={"act_123456789012345\n987654321098765"} value={accounts} onChange={(e) => setAccounts(e.target.value)} />
          <span className="hint">O ID aparece no Gerenciador de Anúncios, na URL (act=…) ou no seletor de contas.</span>
        </div>
      </div>
      <div className="section-title">Custos para o lucro (opcional)</div>
      <div className="settings-grid" style={{ gap: 12 }}>
        <div className="field">
          <label htmlFor="ads-fee">Taxa do gateway (%)</label>
          <input id="ads-fee" className="input" inputMode="decimal" placeholder="Ex.: 4,99" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ads-fixed">Taxa fixa por venda (R$)</label>
          <input id="ads-fixed" className="input" inputMode="decimal" placeholder="Ex.: 1,00" value={fixed} onChange={(e) => setFixed(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ads-tax">Imposto (%)</label>
          <input id="ads-tax" className="input" inputMode="decimal" placeholder="Ex.: 6" value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>
      </div>
      {msg && <div className={msg.error ? "error-text" : "check-ok"} style={{ marginBottom: 10 }}>{msg.text}</div>}
      <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy}>
        {busy ? "Conferindo com a Meta..." : "Salvar"}
      </button>

      <div className="section-title">Parâmetros de URL dos anúncios</div>
      <p className="hint" style={{ marginTop: -4 }}>
        Cole em cada anúncio, em <b>Parâmetros de URL</b> (na criação do anúncio, embaixo do link). É assim que cada venda é ligada à campanha, ao conjunto
        e ao anúncio. Com mais de uma conta, adicione também <code>&amp;px=ID_DO_PIXEL</code> da conta.
      </p>
      <div className="row" style={{ alignItems: "stretch" }}>
        <code className="ads-params">{URL_PARAMS}</code>
        <button
          className="btn btn-sm"
          onClick={() => {
            void navigator.clipboard.writeText(URL_PARAMS).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
