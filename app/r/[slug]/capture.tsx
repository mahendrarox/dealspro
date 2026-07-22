"use client";

import { useState } from "react";
import {
  DEALSPRO_OPT_IN_TITLE,
  DEALSPRO_OPT_IN_SUBTITLE,
  DEALSPRO_SMS_OPT_IN_SHORT_TEXT,
  DEALSPRO_OPT_IN_FOOTER,
  DEALSPRO_TERMS_PATH,
  DEALSPRO_PRIVACY_PATH,
  DEALSPRO_TERMS_LABEL,
  DEALSPRO_PRIVACY_LABEL,
  splitDisclosureForLinks,
} from "@/lib/legal/opt-in-copy";

/**
 * Zero-claimable-drops capture state for /r/[slug].
 *
 * ALL consent copy comes from `lib/legal/opt-in-copy.ts` — no duplicated
 * disclosure text. Submits to the canonical `/api/lead` path (real
 * persistence + monotonic consent). `sourceSlug` is sent for forward-compat
 * but the API does not persist it (attribution out of scope).
 *
 * Privacy: this form never looks up or reveals a returning user's identity.
 * Success shows a generic confirmation — it does NOT echo any name resolved
 * from the phone number.
 */
function formatPhone(val: string): string {
  const d = val.replace(/\D/g, "").slice(0, 10);
  if (!d.length) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const T = {
  red: "#F93A25",
  green: "#22C55E",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  panel: "#14141A",
  border: "#27272A",
  input: "#0A0A0A",
  display: "'DM Sans', sans-serif",
};

export default function RestaurantCapture({
  restaurantName,
  sourceSlug,
}: {
  restaurantName: string;
  sourceSlug: string;
}) {
  // Opt-in requires only a valid phone + explicit consent — no name field.
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const digits = phone.replace(/\D/g, "");
  const valid = digits.length === 10 && optIn;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: `+1${digits}`,
          optIn,
          sourceSlug,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
      } else {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const { pre, between, post } = splitDisclosureForLinks();

  if (done) {
    // Generic confirmation — no name resolved from the phone is shown.
    return (
      <div style={{ textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: T.green,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 8 }}>
          You&apos;re on the list!
        </div>
        <div style={{ fontFamily: T.display, fontSize: 14, color: T.muted }}>
          We&apos;ll text you when {restaurantName} drops its next deal.
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 12,
    border: `1.5px solid ${T.border}`,
    background: T.input,
    color: T.text,
    fontSize: 16,
    fontFamily: T.display,
    outline: "none",
  };

  return (
    <div
      style={{
        maxWidth: 460,
        margin: "0 auto",
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 24,
        padding: "32px 28px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 6 }}>
          {DEALSPRO_OPT_IN_TITLE}
        </div>
        <div style={{ fontFamily: T.display, fontSize: 14, color: T.muted }}>
          {DEALSPRO_OPT_IN_SUBTITLE}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          style={inputStyle}
        />
      </div>

      {/* Opt-in checkbox + centralized disclosure */}
      <div
        style={{
          marginBottom: 16,
          padding: "14px 16px",
          borderRadius: 12,
          background: optIn ? "rgba(34,197,94,0.08)" : "rgba(249,58,37,0.06)",
          border: `1.5px solid ${optIn ? "rgba(34,197,94,0.25)" : "rgba(249,58,37,0.22)"}`,
        }}
      >
        <label
          style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
          onClick={() => setOptIn(!optIn)}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              flexShrink: 0,
              marginTop: 1,
              border: `2px solid ${optIn ? T.green : "#3F3F46"}`,
              background: optIn ? T.green : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {optIn && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <span style={{ fontFamily: T.display, fontSize: 14, lineHeight: 1.4, color: T.text, fontWeight: 500 }}>
            {DEALSPRO_SMS_OPT_IN_SHORT_TEXT}
          </span>
        </label>
        <p style={{ fontFamily: T.display, fontSize: 11, lineHeight: 1.5, color: T.muted, margin: "8px 0 0", paddingLeft: 32 }}>
          {pre}
          <a href={DEALSPRO_TERMS_PATH} style={{ color: T.red, textDecoration: "underline" }}>{DEALSPRO_TERMS_LABEL}</a>
          {between}
          <a href={DEALSPRO_PRIVACY_PATH} style={{ color: T.red, textDecoration: "underline" }}>{DEALSPRO_PRIVACY_LABEL}</a>
          {post}
        </p>
      </div>

      <button
        onClick={submit}
        disabled={!valid || loading}
        style={{
          width: "100%",
          padding: "16px 28px",
          border: "none",
          borderRadius: 12,
          fontFamily: T.display,
          fontWeight: 700,
          fontSize: 16,
          background: valid && !loading ? T.red : "#3F3F46",
          color: valid && !loading ? "#fff" : T.muted,
          cursor: valid && !loading ? "pointer" : "default",
        }}
      >
        {loading ? "Submitting…" : "Get drop alerts"}
      </button>

      {error && (
        <div style={{ marginTop: 12, fontFamily: T.display, fontSize: 13, color: T.red, textAlign: "center" }}>
          {error}
        </div>
      )}

      <div style={{ fontFamily: T.display, fontSize: 12, color: T.muted, marginTop: 14, textAlign: "center" }}>
        {DEALSPRO_OPT_IN_FOOTER}
      </div>
    </div>
  );
}
