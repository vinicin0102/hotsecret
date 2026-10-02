import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { api } from "@/lib/client";

const NAV = [
  { href: "/admin", label: "Dashboard", ico: "◈" },
  { href: "/admin/conversas", label: "Conversas", ico: "💬" },
  { href: "/admin/leads", label: "Leads", ico: "♡" },
  { href: "/admin/fluxos", label: "Fluxos", ico: "⟡" },
  { href: "/admin/personagens", label: "Personagens", ico: "☾" },
  { href: "/admin/produtos", label: "Produtos", ico: "◇" },
  { href: "/admin/pagamentos", label: "Pagamentos", ico: "₿" },
  { href: "/admin/analytics", label: "Analytics", ico: "↗" },
];

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "VIEWER";
}

export function AdminLayout({
  title,
  subtitle,
  actions,
  children,
  bare,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bare?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<{ user: AdminUser }>("/api/admin/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {});
  }, []);

  const isActive = (href: string) => (href === "/admin" ? router.pathname === "/admin" : router.pathname.startsWith(href));

  const logout = async () => {
    await api("/api/admin/auth/logout", { method: "POST", body: {} });
    void router.push("/admin/login");
  };

  return (
    <>
      <Head>
        <title>{`${title} · HOT SECRET`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="admin">
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <div className="brand">
            <Logo />
          </div>
          <nav>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`nav-link ${isActive(n.href) ? "active" : ""}`} onClick={() => setOpen(false)}>
                <span className="ico">{n.ico}</span>
                {n.label}
              </Link>
            ))}
            <div className="nav-sep" />
            <Link href="/admin/configuracoes" className={`nav-link ${isActive("/admin/configuracoes") ? "active" : ""}`}>
              <span className="ico">⚙</span>
              Configurações
            </Link>
          </nav>
          {user && (
            <div className="user-box">
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div className="email">{user.email}</div>
              <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
                <span className="pill">{user.role}</span>
                <button className="btn btn-ghost btn-sm" onClick={logout}>
                  Sair
                </button>
              </div>
            </div>
          )}
        </aside>
        <div className="main">
          {!bare && (
            <div className="topbar">
              <div className="row">
                <button className="btn btn-icon mobile-nav-toggle" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
                  ☰
                </button>
                <div>
                  <h1>{title}</h1>
                  {subtitle && <div className="subtitle">{subtitle}</div>}
                </div>
              </div>
              {actions && <div className="row" style={{ flexWrap: "wrap" }}>{actions}</div>}
            </div>
          )}
          <div className={bare ? "" : "content"}>{children}</div>
        </div>
      </div>
    </>
  );
}
