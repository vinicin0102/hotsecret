import { useEffect, useMemo, useRef, useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import { ApiError, type PayField, type PayMethod, type PayerData } from "@/features/chat-engine/transport";

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
}: {
  loadMethods: () => Promise<PayMethod[] | null>;
  initial?: PayerData | null;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (payer: PayerData) => Promise<unknown>;
  /** o gateway não pede dados (ex.: pré-visualização) */
  onNoForm: () => void;
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
  const load = useRef(loadMethods);
  load.current = loadMethods;
  const noForm = useRef(onNoForm);
  noForm.current = onNoForm;

  useEffect(() => {
    let alive = true;
    load
      .current()
      .then((m) => {
        if (!alive) return;
        if (m === null) return noForm.current();
        setMethods(m);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      if (fields) setErrors(fields);
      setError(err instanceof Error ? err.message : t.generateError);
      setBusy(false);
    }
  };

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
