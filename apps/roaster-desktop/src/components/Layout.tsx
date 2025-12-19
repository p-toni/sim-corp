import type { ReactNode } from "react";

interface LayoutProps {
  title?: string;
  environment?: string;
  sidebar: ReactNode;
  children: ReactNode;
  authSlot?: ReactNode;
}

export function Layout({
  title = "Roaster Desktop",
  environment = "SIM",
  sidebar,
  children,
  authSlot
}: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">{title}</h1>
          <p className="app-subtitle">Simulated roast control panel</p>
        </div>
        <div className="app-env">
          <span className="badge">{environment}</span>
          {authSlot ? <div className="auth-slot">{authSlot}</div> : null}
        </div>
      </header>
      <main className="app-main">
        <aside className="app-sidebar">{sidebar}</aside>
        <section className="app-content">{children}</section>
      </main>
    </div>
  );
}
