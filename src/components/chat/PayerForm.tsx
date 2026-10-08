import { useEffect, useMemo, useRef, useState } from "react";
import { validPersonName } from "@/lib/person-name";
import { useChatI18n } from "@/features/i18n/chat";
import { ApiError, type PayField, type PayMethod, type PayMethods, type PayerData } from "@/features/chat-engine/transport";

/**
 * Dados do comprador que o gateway pede (campos vindos do catálogo em tempo real — nada fixo aqui).
 * Nunca coleta dados de cartão: esses métodos ficam fora do catálogo deste checkout.
 */
export function PayerForm({
  loadMethods,
  initial,
  submitLabel,
  busyLabel,
  onSubmit,
  onNoForm,
  autoSubmit,
}: {
  loadMethods: () => Promise<PayMethods | null>;
  initial?: PayerData | null;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (payer: PayerData) => Promise<unknown>;
  /** o gateway não pede dados (ex.: pré-visualização) */
  onNoForm: () => void;
  /** com nome e e-mail já conhecidos, gera sozinho (pop-up da chamada, como o PIX) */
  autoSubmit?: boolean;
}) {
  const { t } = useChatI18n();
  const [methods, setMethods] = useState<PayMethod[] | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState<string>(initial?.methodCode ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [values, setValues] = useState<Record<string, string>>(initial?.customer ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** o lead tocou em "Cambiar" (ou o servidor recusou um dado): mostra os campos */
  const [editing, setEditing] = useState(false);
  /** os dados vieram prontos (conversa/compra anterior) — digitar no formulário nunca ativa o atalho */
  const [known, setKnown] = useState(!!initial?.email);
  const autoSent = useRef(false);
  const load = useRef(loadMethods);
  load.current = loadMethods;
  const noForm = useRef(onNoForm);
  noForm.current = onNoForm;

  useEffect(() => {
    let alive = true;
    load
      .current()
      .then((r) => {
        if (!alive) return;
        if (r === null) return noForm.current();
        const m = r.methods;
        setMethods(m);
        // o que o lead já informou vem preenchido (sem apagar o que ele digitou)
        if (r.prefill?.email) setEmail((cur) => cur || r.prefill!.email!);
        if (r.prefill?.name) setValues((cur) => (cur.name ? cur : { ...cur, name: r.prefill!.name! }));
        if (r.prefill?.email || r.prefill?.name) setKnown(true);
        // já vem marcado o primeiro (o catálogo vem com as opções digitais antes das presenciais)
        setCode((cur) => (cur && m.some((x) => x.code === cur) ? cur : (m[0]?.code ?? "")));
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : t.generateError));
    return () => {
      alive = false;
    };
  }, [t.generateError]);

  const method = methods?.find((m) => m.code === code);
  // select com uma única opção obrigatória já vem preenchido e não aparece
  const fixed = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of method?.fields ?? []) if (f.options?.length === 1 && f.required) out[f.name] = f.options[0].value;
    return out;
  }, [method]);
  const visible = (method?.fields ?? []).filter((f) => !(f.name in fixed));

  // erro some assim que a pessoa corrige o campo
  const change = (name: string, v: string) => {
    setValues((cur) => ({ ...cur, [name]: v }));
    setErrors(({ [name]: _gone, ...rest }) => rest);
  };

  const label = (f: PayField) => (/^[A-Z]{2,6}$/.test(f.label) ? f.label : (t.fieldLabels[f.name] ?? f.label));

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  // dados reais que o lead já informou (pergunta do fluxo ou compra anterior) cobrem tudo o que o método pede
  const ready =
    known &&
    !editing &&
    !!method &&
    emailOk &&
    visible.every((f) => (f.name === "name" ? validPersonName(values.name ?? "") : !!(values[f.name] ?? "").trim()));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!method) return;
    const customer: Record<string, string> = {};
    const errs: Record<string, string> = {};
    for (const f of method.fields) {
      const v = (fixed[f.name] ?? values[f.name] ?? "").trim();
      if (!v && f.required) errs[f.name] = "required";
      else if (f.maxLength && v.length > f.maxLength) errs[f.name] = "too_long";
      if (v) customer[f.name] = v;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = email.trim() ? "invalid_email" : "required";
    setErrors(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit({ methodCode: method.code, email: email.trim(), customer });
    } catch (err) {
      const fields = err instanceof ApiError ? (err.data.fields as Record<string, string> | undefined) : undefined;
      if (fields) {
        setErrors(fields);
        setEditing(true); // dado recusado: abre os campos para corrigir
      }
      setError(err instanceof Error ? err.message : t.generateError);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoSubmit && ready && !autoSent.current) {
      autoSent.current = true;
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, ready]);

  if (loadError) return <div className="error-text">{loadError}</div>;
  if (methods === undefined) {
    return (
      <div className="pix-wait">
        <span className="once-spin" /> {t.loadingMethods}
      </div>
    );
  }
  if (methods === null) return null;
  if (!methods.length) return <div className="error-text">{t.offerUnavailable}</div>;

  const errText = (name: string) => (errors[name] ? <span className="payer-err">{t.fieldErrors[errors[name]] ?? t.fieldErrors.required}</span> : null);

  if (ready) {
    // igual ao PIX: um toque gera os dados de pagamento, a nome de quem já se identificou na conversa
    return (
      <form className="payer-form" onSubmit={submit} noValidate>
        <div className="payer-ready">
          {t.payingAs} <b>{values.name || email}</b>
          <button type="button" className="link-btn" onClick={() => setEditing(true)} disabled={busy}>
            {t.change}
          </button>
        </div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary btn-block cta-glow" type="submit" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
      </form>
    );
  }

  return (
    <form className="payer-form" onSubmit={submit} noValidate>
      <div className="payer-title">{t.payerTitle}</div>
      {methods.length > 1 && (
        <div className="payer-methods" role="radiogroup" aria-label={t.payWith}>
          {methods.map((m) => (
            <button key={m.code} type="button" role="radio" aria-checked={code === m.code} className={code === m.code ? "active" : ""} onClick={() => setCode(m.code)}>
              {m.displayName}
            </button>
          ))}
        </div>
      )}
      {method && (
        <>
          <label className="payer-field">
            <span>{t.email}</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" maxLength={200} value={email} onChange={(e) => {
                setEmail(e.target.value);
                setErrors(({ email: _gone, ...rest }) => rest);
              }}
            />
            {errText("email")}
          </label>
          {visible.map((f) => (
            <label key={f.name} className="payer-field">
              <span>{label(f)}</span>
              {f.options?.length ? (
                <select className="input" value={values[f.name] ?? ""} onChange={(e) => change(f.name, e.target.value)}>
                  <option value="" />
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                  autoComplete={f.autocomplete}
                  maxLength={f.maxLength}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => change(f.name, f.name === "documentNumber" ? e.target.value.toUpperCase() : e.target.value)}
                />
              )}
              {errText(f.name)}
            </label>
          ))}
        </>
      )}
      {error && <div className="error-text">{error}</div>}
      <button className="btn btn-primary btn-block cta-glow" type="submit" disabled={busy || !method}>
        {busy ? busyLabel : submitLabel}
      </button>
      <div className="secure-note">🔒 {t.payerNote}</div>
    </form>
  );
}
