import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/ui/Logo";
import { api } from "@/lib/client";

export default function Login() {
  const router = useRouter();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ needsSetup: boolean }>("/api/admin/auth/setup")
      .then((r) => setNeedsSetup(r.needsSetup))
      .catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (needsSetup) await api("/api/admin/auth/setup", { body: form });
      else await api("/api/admin/auth/login", { body: { email: form.email, password: form.password } });
      const next = typeof router.query.next === "string" && router.query.next.startsWith("/admin") ? router.query.next : "/admin";
      void router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Head>
        <title>Entrar · HOT SECRET</title>
      </Head>
      <form className="card auth-card" onSubmit={submit}>
        <Logo size={34} />
        <div className="slogan">Conversas que guardam segredos.</div>
        {needsSetup && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Primeiro acesso: crie a conta do administrador principal.
            </p>
            <div className="field">
              <label htmlFor="setup-name">Nome</label>
              <input id="setup-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="field">
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete={needsSetup ? "new-password" : "current-password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Entrando..." : needsSetup ? "Criar conta e entrar" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
