"use client";
import { useState, useTransition, useEffect } from "react";
import { requestAdminLink } from "./actions";

const T = {
  bg: "#0A0A0A",
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  display: "'DM Sans', sans-serif",
};

function useAuthHashExchange() {
  const [exchanging, setExchanging] = useState(false);
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=")) return;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    if (!accessToken) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setExchanging(true);
    fetch("/admin/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) window.location.href = "/admin/drops";
        else window.location.href = "/admin/login?error=verify_failed";
      })
      .catch(() => setExchanging(false));
  }, []);
  return exchanging;
}

export default function LoginPage() {
  const exchanging = useAuthHashExchange();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLink(null);
    startTransition(async () => {
      const res = await requestAdminLink(email);
      if (res.ok) setLink(res.link);
      else setError(res.error);
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        fontFamily: T.display,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          padding: 32,
          width: "100%",
          maxWidth: 420,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
          <span style={{ color: T.red }}>Deals</span>Pro Studio
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          Internal admin · sign-in required
        </div>

        <form onSubmit={onSubmit}>
          <label style={{ fontSize: 13, color: T.muted, display: "block", marginBottom: 6 }}>
            Admin email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${T.border}`,
              background: "#0A0A0A",
              color: T.text,
              fontSize: 15,
              fontFamily: T.display,
              marginBottom: 16,
            }}
          />
          <button
            type="submit"
            disabled={pending || !email}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: pending || !email ? "#3F3F46" : T.red,
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: pending || !email ? "default" : "pointer",
              fontFamily: T.display,
            }}
          >
            {pending ? "Generating link..." : "Send magic link"}
          </button>
        </form>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(249,58,37,0.1)",
              border: `1px solid rgba(249,58,37,0.3)`,
              color: T.red,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {link && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              background: "rgba(22,163,74,0.1)",
              border: `1px solid rgba(22,163,74,0.3)`,
            }}
          >
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>
              ✓ Magic link ready (one-time use)
            </div>
            <a
              href={link}
              style={{
                display: "block",
                padding: "10px 12px",
                background: T.red,
                borderRadius: 8,
                color: "#fff",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              Click to sign in →
            </a>
          </div>
        )}

        <div style={{ marginTop: 24, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
          Links are single-use and expire in ~1 hour. If you close this tab before clicking, request a new link.
        </div>
      </div>
    </div>
  );
}
