import type { ReactNode } from "react";

export const metadata = {
  title: "DealsPro Studio",
  robots: { index: false, follow: false },
};

const T = {
  bg: "#0A0A0A",
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  display: "'DM Sans', sans-serif",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        fontFamily: T.display,
      }}
    >
      <nav
        style={{
          borderBottom: `1px solid ${T.border}`,
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: T.panel,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>
            <span style={{ color: T.red }}>Deals</span>Pro Studio
          </span>
          <span style={{ fontSize: 11, color: T.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            internal
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/admin/drops" style={{ color: T.muted, textDecoration: "none", fontSize: 14 }}>
            Drops
          </a>
          <a href="/admin/drops/new" style={{ color: T.muted, textDecoration: "none", fontSize: 14 }}>
            New
          </a>
          <a href="/admin/auth/logout" style={{ color: T.muted, textDecoration: "none", fontSize: 14 }}>
            Sign out
          </a>
        </div>
      </nav>
      <main style={{ padding: "32px 24px", maxWidth: 1120, margin: "0 auto" }}>{children}</main>
    </div>
  );
}
