"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { DropItem } from "@/lib/drops/types";
import { formatPhone } from "@/components/PhoneInput";
import { useUserLocation } from "@/lib/hooks/useUserLocation";
import DropsSection, { DropCard, type DropsData } from "@/components/DropsSection";
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

const T = {
  color: {
    // ── DealsPro fire accent (red/orange). Used for badges, urgency,
    //    highlights and glows. CTA *buttons* are black (n900/ink) — the
    //    fire palette is accent-only. ──
    fire50: "#FFF1EC", fire100: "#FFE0D4", orange400: "#FB8C3C",
    fire500: "#F93A25", fire600: "#E0311F", fire700: "#C72A1A",
    // Legacy red aliases (kept === fire for any incidental references).
    red50: "#FFF1EC", red100: "#F9A29A", red500: "#F93A25",
    red600: "#E0311F", red700: "#C72A1A",
    green50: "#DCFCE7", green500: "#16A34A",
    amber50: "#FEF3C7", amber500: "#D97706",
    ink: "#161616",
    n0: "#FFFFFF", n50: "#F7F7F8", n200: "#E4E4E7", n300: "#D4D4D8",
    n400: "#A1A1AA", n500: "#52525B", n800: "#1C1C21",
    n900: "#18181B", n950: "#111114",
  },
  // Warm fire gradient for the hero highlight + accents.
  fireGrad: "linear-gradient(120deg, #FB8C3C 0%, #F93A25 100%)",
  font: { display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
    deal: "0 10px 30px rgba(24,24,24,0.10)",
    dealHover: "0 18px 44px rgba(24,24,24,0.16)",
    focus: "0 0 0 3px rgba(249,58,37,0.3)",
  },
  radius: { sm: "6px", md: "8px", lg: "12px", xl: "16px", xxl: "24px", full: "9999px" },
  tr: { fast: "150ms ease", base: "200ms ease", spring: "300ms cubic-bezier(0.34,1.56,0.64,1)" },
};

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }
  ::selection { background: ${T.color.fire100}; color: ${T.color.fire700}; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes floatSlow { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes checkPop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
  @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }
  @keyframes consentNudge { 0%,100%{box-shadow:0 0 0 3px rgba(249,58,37,0.08)} 50%{box-shadow:0 0 0 6px rgba(249,58,37,0.18)} }
  .fire-text { background-image: linear-gradient(120deg, #FB8C3C 0%, #F93A25 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: #F93A25; }
  @media (prefers-reduced-motion: reduce) {
    .consent-nudge { animation: none !important; }
  }
`;

function useInView() {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.unobserve(el); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, v];
}

// formatPhone imported from @/components/PhoneInput

// ── LOGO: Uses actual brand logo from /public/logo.png ──
function DPLogo({ size = 36, dark = false }) {
  const s = size / 36;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: `${8 * s}px` }}>
      <img
        src="/logo.png"
        alt="DealsPro"
        style={{
          width: `${42 * s}px`,
          height: `${42 * s}px`,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
      <span style={{
        fontFamily: T.font.display, fontSize: `${20 * s}px`, fontWeight: 800,
        letterSpacing: "-0.02em", color: dark ? "#FFFFFF" : "#18181B", lineHeight: 1,
      }}>
        Deals<span style={{ color: T.color.fire500 }}>Pro</span>
      </span>
    </div>
  );
}

function Badge({ type = "drop", children }) {
  const s = { drop: { bg: T.color.fire50, c: T.color.fire700 }, savings: { bg: T.color.green50, c: T.color.green500 }, soldOut: { bg: T.color.n200, c: T.color.n400 } }[type] || { bg: T.color.fire50, c: T.color.fire700 };
  return <span style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: T.radius.full, background: s.bg, color: s.c, display: "inline-block" }}>{children}</span>;
}

function Btn({ children, variant = "primary", full, disabled, onClick, style = {} }) {
  const [h, setH] = useState(false);
  const base = { fontFamily: T.font.display, fontWeight: 700, fontSize: "14px", letterSpacing: "0.03em", border: "none", cursor: disabled ? "not-allowed" : "pointer", borderRadius: T.radius.lg, transition: `all ${T.tr.base}`, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "14px 28px", width: full ? "100%" : undefined };
  const v = disabled ? { background: T.color.n200, color: T.color.n400 }
    : variant === "secondary" ? { background: "transparent", color: T.color.n900, border: `2px solid ${h ? T.color.n400 : T.color.n300}` }
    : { background: h ? T.color.fire600 : T.color.fire500, color: "#fff", boxShadow: h ? T.shadow.md : T.shadow.sm, transform: h ? "translateY(-1px)" : "none" };
  return <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={disabled ? undefined : onClick} style={{ ...base, ...v, ...style }}>{children}</button>;
}

// ── Capture Form: Real-time validation ────────────────
function CaptureForm({ dark }) {
  // Opt-in requires only a valid phone + explicit consent — no name field
  // (friction reduction). Name is never collected or sent from this form.
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [focus, setFocus] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [consentTouched, setConsentTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length === 10;
  const allValid = phoneValid && optIn;
  const digitsLeft = 10 - digits.length;

  // Show validation only after the user has touched the field (blur)
  // OR after they attempt to submit. Initial render = clean, no errors.
  const showPhoneError = (phoneTouched || submitAttempted) && !phoneValid;
  const showPhoneOk = (phoneTouched || submitAttempted) && phoneValid;
  const showConsentError = (consentTouched || submitAttempted) && !optIn;

  const submit = async () => {
    // Mark every field touched so any missing values surface their amber state
    setSubmitAttempted(true);
    setPhoneTouched(true);
    setConsentTouched(true);

    if (!allValid || loading) return;
    setLoading(true);
    setSubmitError("");
    console.log("[Form] Submit received:", { phone: `+1${digits}` });
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+1${digits}`, optIn }),
      });
      const data = await res.json();
      if (data.success) {
        // Store phone in localStorage for deal page checkout
        try { localStorage.setItem("dp_phone", `+1${digits}`); } catch {}
        setDone(true);
        // Auto-scroll to deals after brief delay
        setTimeout(() => {
          const el = document.getElementById("deals");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }, 2000);
      } else {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
      }
    } catch {
      setSubmitError("Network error. Please try again.");
      setLoading(false);
    }
  };

  if (done) return (
    <div style={{
      width: "100%", maxWidth: "480px",
      background: dark ? "rgba(255,255,255,0.06)" : T.color.n0,
      border: `1.5px solid ${dark ? "rgba(255,255,255,0.1)" : T.color.n200}`,
      borderRadius: T.radius.xxl,
      padding: "40px 28px",
      boxShadow: dark ? "0 8px 40px rgba(0,0,0,0.4)" : "0 8px 30px rgba(0,0,0,0.08)",
      backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", animation: "fadeUp 0.4s ease",
    }}>
      <div style={{ width: "60px", height: "60px", borderRadius: "50%", background: T.color.green500, display: "flex", alignItems: "center", justifyContent: "center", animation: "checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: "20px", color: dark ? "#fff" : T.color.n900 }}>You're on the list!</div>
      <div style={{ fontFamily: T.font.display, fontSize: "14px", color: T.color.n400 }}>Check your phone — we'll text you the moment new drops go live.</div>
    </div>
  );

  // ── Border colors ────────────────────────────────────────────────
  // Priority: focus (brand red @ 0.4) > error (amber) > valid (green) > neutral grey.
  const AMBER = "#F59E0B";
  const VALID_GREEN = "#22C55E";
  const NEUTRAL = "#D1D5DB";
  const FOCUS_FIRE = "rgba(249, 58, 37, 0.55)";
  const FOCUS_GLOW = "0 0 0 3px rgba(249, 58, 37, 0.12)";

  const phoneBorder =
    focus === "phone" ? FOCUS_FIRE :
    showPhoneError ? AMBER :
    showPhoneOk ? VALID_GREEN :
    NEUTRAL;

  const cardBg = "#FFFFFF";
  const cardBorder = T.color.n200;
  const labelColor = T.color.n500;
  const inputBg = "#F5F5F5";

  return (
    <div style={{
      width: "100%", maxWidth: "480px",
      background: cardBg,
      border: `1.5px solid ${cardBorder}`,
      borderRadius: T.radius.xxl,
      padding: "32px 28px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <div style={{ fontFamily: T.font.display, fontSize: "20px", fontWeight: 700, color: T.color.n900, marginBottom: "6px" }}>{DEALSPRO_OPT_IN_TITLE}</div>
        <div style={{ fontFamily: T.font.display, fontSize: "14px", color: T.color.n500 }}>{DEALSPRO_OPT_IN_SUBTITLE}</div>
      </div>

      {/* Phone */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: labelColor, marginBottom: "6px", letterSpacing: "0.01em" }}>
          Phone Number
        </label>
        <div style={{
          display: "flex",
          borderRadius: T.radius.lg, overflow: "hidden",
          border: `2px solid ${phoneBorder}`,
          boxShadow: focus === "phone" ? FOCUS_GLOW : "none",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          background: inputBg,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 14px", background: T.color.n200, borderRight: `1px solid ${T.color.n300}`, flexShrink: 0 }}>
            <img src="https://flagcdn.com/w40/us.png" alt="US" style={{ width: "20px", height: "14px", objectFit: "cover", borderRadius: "2px" }} />
            <span style={{ fontFamily: T.font.mono, fontSize: "14px", fontWeight: 700, color: T.color.n500 }}>+1</span>
          </div>
          <input type="tel" autoComplete="tel" inputMode="tel" placeholder="(555) 123-4567" value={phone}
            onChange={e => setPhone(formatPhone(e.target.value))}
            onFocus={() => setFocus("phone")}
            onBlur={() => { setFocus(null); setPhoneTouched(true); }}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            style={{ flex: 1, padding: "16px 14px", border: "none", outline: "none", fontFamily: T.font.display, fontSize: "16px", fontWeight: 500, color: T.color.n900, background: "transparent", minWidth: 0 }}
          />
          {showPhoneOk && (
            <div style={{ display: "flex", alignItems: "center", paddingRight: "14px" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={VALID_GREEN} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          )}
        </div>
        {/* In-field live countdown: shown while typing (1–9 digits) and on
            blur/submit when still empty. Replaces the old static error; the
            green check (showPhoneOk) still handles the complete state, so we
            never render "0 more digits needed". */}
        {!phoneValid && (digits.length > 0 || showPhoneError) && (
          <div style={{ fontFamily: T.font.display, fontSize: "12px", color: AMBER, marginTop: "6px", paddingLeft: "2px" }}>
            {digitsLeft} more digit{digitsLeft === 1 ? "" : "s"} needed
          </div>
        )}
      </div>

      {/* Opt-in checkbox + disclosure (plain control; copy centralized in lib/legal/opt-in-copy).
          Container tint is driven ONLY by `optIn`: soft red = "not selected yet"
          (not an error), green = selected. Compact, not a bulky block. */}
      <div style={{
        marginBottom: "20px",
        padding: "14px 16px",
        borderRadius: T.radius.lg,
        background: optIn ? "rgba(22,163,74,0.08)" : "rgba(249,58,37,0.06)",
        border: `1.5px solid ${optIn ? "rgba(22,163,74,0.25)" : "rgba(249,58,37,0.22)"}`,
        transition: "background-color 150ms ease, border-color 150ms ease",
      }}>
        <label
          style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}
          onClick={() => { setOptIn(!optIn); setConsentTouched(true); }}
        >
          <div style={{
            width: "22px", height: "22px", borderRadius: "6px", flexShrink: 0, marginTop: "1px",
            border: `2px solid ${optIn ? VALID_GREEN : showConsentError ? AMBER : T.color.n300}`,
            background: optIn ? VALID_GREEN : T.color.n0,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: `all ${T.tr.fast}`,
          }}>
            {optIn && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
          <span style={{ fontFamily: T.font.display, fontSize: "14px", lineHeight: 1.4, color: T.color.n900, fontWeight: 500 }}>
            {DEALSPRO_SMS_OPT_IN_SHORT_TEXT}
          </span>
        </label>

        {/* Disclosure presentation only (no state/behavior change):
            - before the box is checked: a short helper line.
            - after it's checked: a summary line + the full canonical
              disclosure with Terms / Privacy Policy links. */}
        {!optIn ? (
          <p style={{ fontFamily: T.font.display, fontSize: "11px", lineHeight: 1.5, color: T.color.n500, margin: "8px 0 0", paddingLeft: "32px" }}>
            By checking this box, you agree to receive DealsPro marketing text alerts.
          </p>
        ) : (
          (() => {
            const { pre, between, post } = splitDisclosureForLinks();
            const linkStyle = { color: T.color.fire600, textDecoration: "underline" } as const;
            return (
              <div style={{ margin: "8px 0 0", paddingLeft: "32px" }}>
                <p style={{ fontFamily: T.font.display, fontSize: "12px", lineHeight: 1.5, color: T.color.n900, fontWeight: 500, margin: "0 0 4px" }}>
                  DealsPro may text you local deals and limited drops.
                </p>
                <p style={{ fontFamily: T.font.display, fontSize: "11px", lineHeight: 1.5, color: T.color.n500, margin: 0 }}>
                  {pre}
                  <a href={DEALSPRO_TERMS_PATH} style={linkStyle}>{DEALSPRO_TERMS_LABEL}</a>
                  {between}
                  <a href={DEALSPRO_PRIVACY_PATH} style={linkStyle}>{DEALSPRO_PRIVACY_LABEL}</a>
                  {post}
                </p>
              </div>
            );
          })()
        )}

        {showConsentError && (
          <div style={{ fontFamily: T.font.display, fontSize: "12px", color: AMBER, marginTop: "8px", paddingLeft: "32px", fontWeight: 500 }}>Please agree to receive marketing text alerts</div>
        )}
      </div>

      {/* Eligibility message */}
      {allValid && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center", marginBottom: "12px", animation: "fadeUp 0.3s ease" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.color.green500} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: T.color.green500 }}>You're eligible for today's deals!</span>
        </div>
      )}

      {/* Submit — always clickable so submit() runs validation feedback */}
      <button onClick={loading ? undefined : submit} style={{
        width: "100%", padding: "18px 28px",
        border: "none",
        borderRadius: T.radius.lg, fontFamily: T.font.display,
        fontWeight: allValid && !loading ? 700 : 500,
        fontSize: "16px", letterSpacing: "0.03em",
        background: allValid && !loading ? T.color.fire500 : "#E5E7EB",
        color: allValid && !loading ? "#FFFFFF" : "rgb(75, 85, 99)",
        opacity: allValid && !loading ? 1 : 0.9,
        cursor: loading ? "default" : "pointer",
        transition: "all 0.2s ease",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        boxShadow: allValid && !loading ? "0 6px 18px rgba(249,58,37,0.4), 0 1px 3px rgba(0,0,0,0.12)" : "none",
      }}>
        {loading ? "Setting up checkout..." : "Get drop alerts"}
        {allValid && !loading && <span style={{ fontSize: "18px" }}>→</span>}
      </button>

      {submitError && (
        <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: T.radius.md, background: "rgba(249,58,37,0.1)", border: "1px solid rgba(249,58,37,0.25)", fontFamily: T.font.display, fontSize: "13px", color: "#F93A25" }}>
          {submitError}
        </div>
      )}

      <div style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400, marginTop: "14px", textAlign: "center" }}>{DEALSPRO_OPT_IN_FOOTER}</div>
    </div>
  );
}

const Icon = {
  phone: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.color.fire500} strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  msg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.color.fire500} strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  qr: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.color.fire500} strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>,
  check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.color.green500} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  menu: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ── Sample drops for the hero mockup (decorative only — shown when no live
//    DB drops exist so the hero never renders empty and matches the premium
//    reference. Real drops render below in <DropsSection/>). ──
const HERO_SAMPLE_DROPS = [
  { tag: "DROP EXCLUSIVE", title: "Family Biryani Drop", place: "Sai Gayatri · Frisco", left: "Only 12 left", price: "$39", pickup: "Fri 6–8pm" },
  { tag: "WEEKEND ONLY", title: "BBQ Family Platter", place: "Smokey's · Prosper", left: "Only 6 left", price: "$45", pickup: "Sat 12–2pm" },
  { tag: "LIMITED BATCH", title: "Weekend Dessert Box", place: "Sweet Lane · Frisco", left: "Only 8 left", price: "$24", pickup: "Sun 10am–12pm" },
];

function HeroMockup() {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "420px", margin: "0 auto", animation: "floatSlow 6s ease-in-out infinite" }}>
      {/* Glow behind the panel */}
      <div style={{ position: "absolute", inset: "-12% -8% -8% -8%", background: "radial-gradient(circle at 50% 30%, rgba(249,58,37,0.30) 0%, rgba(251,140,60,0.14) 45%, transparent 72%)", filter: "blur(8px)", zIndex: 0 }} />
      {/* Device panel */}
      <div style={{
        position: "relative", zIndex: 1,
        background: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "28px", padding: "18px 16px",
        boxShadow: "0 30px 70px rgba(0,0,0,0.5)", backdropFilter: "blur(14px)",
      }}>
        {/* Panel header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 0 3px rgba(34,197,94,0.25)" }} />
            <span style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 700, color: "#fff" }}>Drops near you</span>
          </div>
          <span style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>FRISCO, TX</span>
        </div>
        {/* Sample drop rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {HERO_SAMPLE_DROPS.map((d) => (
            <div key={d.title} style={{
              display: "flex", alignItems: "center", gap: "12px",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px", padding: "12px 14px",
            }}>
              {/* Thumb */}
              <div style={{ width: 52, height: 52, borderRadius: "12px", flexShrink: 0, background: "linear-gradient(135deg, #F93A25, #FB8C3C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px" }}>🍽️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.font.mono, fontSize: "9px", fontWeight: 800, letterSpacing: "0.08em", color: "#FDBA8C", marginBottom: "3px" }}>{d.tag}</div>
                <div style={{ fontFamily: T.font.display, fontSize: "14px", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                <div style={{ fontFamily: T.font.display, fontSize: "11px", color: "rgba(255,255,255,0.55)" }}>{d.place} · {d.pickup}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: T.font.mono, fontSize: "16px", fontWeight: 800, color: "#fff" }}>{d.price}</div>
                <div style={{ fontFamily: T.font.display, fontSize: "10px", fontWeight: 800, color: "#FF8A5C" }}>{d.left}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Floating "reserve" pill */}
      <div style={{ position: "absolute", zIndex: 2, right: "-8px", bottom: "44px", background: T.color.ink, color: "#fff", fontFamily: T.font.display, fontWeight: 700, fontSize: "12px", padding: "9px 16px", borderRadius: "9999px", boxShadow: "0 12px 26px rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.08)", animation: "float 4s ease-in-out infinite" }}>
        Reserve · prepaid ✓
      </div>
    </div>
  );
}

type HomepageProps = { initialDrops?: DropItem[] };

export default function App({ initialDrops }: HomepageProps = {}) {
  // DB-backed drops from the server component. No constants fallback.
  const drops: DropItem[] = initialDrops ?? [];
  const [scrolled, setScrolled] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [dropsData, setDropsData] = useState<DropsData>({ featured: null, spotsMap: {}, loading: true, activeCount: 0 });
  const { getDistance } = useUserLocation();

  // Featured drop for the hero: only a genuinely active/selected featured
  // drop earns the real card. When none is active (all ended / none yet), the
  // hero shows the premium product mockup instead of a stale card.
  const featuredDrop: DropItem | null = dropsData.featured ?? null;
  // Only show the real card when a drop is genuinely active/claimable. When
  // nothing is live (all ended, or only an admin-pinned expired hero), the
  // hero shows the premium mockup instead of a stale "ended" card.
  const showHeroCard = dropsData.activeCount > 0 && featuredDrop !== null;
  const featuredSpots = featuredDrop
    ? dropsData.spotsMap[featuredDrop.id] ?? featuredDrop.total_spots
    : 0;

  useEffect(() => { const fn = () => setScrolled(window.scrollY > 60); window.addEventListener("scroll", fn, { passive: true }); return () => window.removeEventListener("scroll", fn); }, []);

  const SH = ({ label, title, dark, center = true }) => { const [r, v] = useInView(); return (<div ref={r} style={{ textAlign: center ? "center" : "left", marginBottom: "48px", opacity: v ? 1 : 0, animation: v ? "fadeUp 0.5s ease both" : "none" }}><div style={{ fontFamily: T.font.display, fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.color.fire600, marginBottom: "12px" }}>{label}</div><h2 style={{ fontFamily: T.font.display, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: dark ? "#fff" : T.color.n900 }}>{title}</h2></div>); };

  return (
    <div style={{ fontFamily: T.font.display, color: T.color.n900, background: T.color.n0, overflowX: "hidden" }}>
      <style>{css}</style>
      <style>{`@media(max-width:768px){.dk{display:none!important}.mb{display:block!important}.hg{grid-template-columns:1fr!important;text-align:center}.hg>div:first-child{display:flex;flex-direction:column;align-items:center}.rg{grid-template-columns:1fr!important}.fg{grid-template-columns:1fr 1fr!important}}@media(max-width:480px){.fg{grid-template-columns:1fr!important}}`}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: scrolled ? "rgba(255,255,255,0.92)" : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: scrolled ? `1px solid ${T.color.n200}` : "1px solid transparent", transition: "all 0.3s ease", padding: "0 20px" }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <DPLogo size={scrolled ? 34 : 38} dark={!scrolled} />
          <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
            <div className="dk" style={{ display: "flex", gap: "28px" }}>{["How It Works", "For Restaurants"].map(l => <a key={l} href={`#${l.toLowerCase().replace(/\s+/g,"-")}`} style={{ fontFamily: T.font.display, fontSize: "14px", fontWeight: 500, color: scrolled ? T.color.n500 : "rgba(255,255,255,0.7)", textDecoration: "none" }}>{l}</a>)}</div>
            <a href="#get-deals" className="dk" style={{ textDecoration: "none" }}><Btn style={{ padding: "10px 20px", fontSize: "13px" }}>Get drop alerts</Btn></a>
            <button className="mb" onClick={() => setMobileNav(true)} style={{ background: "none", border: "none", cursor: "pointer", color: scrolled ? T.color.n900 : "#fff", display: "none" }}>{Icon.menu}</button>
          </div>
        </div>
      </nav>
      {mobileNav && <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)" }} onClick={() => setMobileNav(false)}><div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "280px", background: T.color.n0, padding: "24px" }} onClick={e => e.stopPropagation()}><button onClick={() => setMobileNav(false)} style={{ background: "none", border: "none", cursor: "pointer", position: "absolute", top: "20px", right: "20px", color: T.color.n900 }}>{Icon.close}</button><div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "48px" }}>{["How It Works", "For Restaurants"].map(l => <a key={l} href={`#${l.toLowerCase().replace(/\s+/g,"-")}`} onClick={() => setMobileNav(false)} style={{ fontFamily: T.font.display, fontSize: "18px", fontWeight: 600, color: T.color.n900, textDecoration: "none" }}>{l}</a>)}<a href="#get-deals" onClick={() => setMobileNav(false)} style={{ textDecoration: "none" }}><Btn full>Get drop alerts</Btn></a></div></div></div>}

      {/* HERO */}
      <section style={{ background: `linear-gradient(170deg, ${T.color.n950} 0%, #0D0D10 60%, ${T.color.n800} 100%)`, padding: "80px 20px 40px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: `radial-gradient(${T.color.n400} 1px, transparent 1px)`, backgroundSize: "24px 24px" }}/>
        <div style={{ position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px", background: "radial-gradient(circle, rgba(249,58,37,0.16) 0%, rgba(251,140,60,0.08) 45%, transparent 70%)", borderRadius: "50%" }}/>
        <div className="hg" style={{ maxWidth: "1120px", margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center" }}>
          <div style={{ animation: "fadeUp 0.6s ease both" }}>
            {/* Locality + live-count badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderRadius: T.radius.full, background: "rgba(249,58,37,0.14)", border: "1px solid rgba(249,58,37,0.32)", marginBottom: "22px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FB8C3C", boxShadow: "0 0 8px rgba(251,140,60,0.9)", animation: "pulseDot 1.6s ease-in-out infinite" }} />
              <span style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: "#FFD9CC", letterSpacing: "0.01em" }}>
                {(() => { const n = dropsData.activeCount > 0 ? dropsData.activeCount : 3; return `This week in Frisco · ${n} drop${n === 1 ? "" : "s"} live`; })()}
              </span>
            </div>
            <h1 style={{ fontFamily: T.font.display, fontSize: "clamp(30px, 5vw, 48px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em", color: "#fff", marginBottom: "20px" }}>
              Premium restaurant drops.<br />Limited. Prepaid.{" "}
              <span className="fire-text">Gone fast.</span>
            </h1>
            <p style={{ fontFamily: T.font.display, fontSize: "17px", lineHeight: 1.6, color: T.color.n400, marginBottom: "22px", maxWidth: "480px" }}>The best local food, dropped in limited batches every week. Discover what's near you, reserve your spot, and pick it up fresh. When it's gone, it's gone.</p>
            {/* Trust / urgency line — sits right above the opt-in */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "18px" }}>
              <span style={{ color: "#FB8C3C", fontSize: "15px", lineHeight: 1 }}>🔥</span>
              <span style={{ fontFamily: T.font.display, fontSize: "13.5px", fontWeight: 600, color: "#FFD9CC", letterSpacing: "0.01em" }}>Limited weekly drops from local restaurants. No app required.</span>
            </div>
            <CaptureForm dark />
          </div>
          <div style={{ display: "flex", justifyContent: "center", animation: "fadeUp 0.6s ease 0.2s both" }}>
            {showHeroCard && featuredDrop ? (
              <div style={{ animation: "float 4s ease-in-out infinite", maxWidth: "440px", width: "100%", margin: "0 auto" }}><DropCard item={featuredDrop} spotsRemaining={featuredSpots} distance={getDistance(featuredDrop.lat, featuredDrop.lng)} isAboveFold featured /></div>
            ) : (
              <HeroMockup />
            )}
          </div>
        </div>
      </section>

      {/* FOOD HERO IMAGE */}
      <section style={{ position: "relative", width: "100%", maxHeight: "420px", overflow: "hidden" }}>
        <Image
          src="/hero-food.avif"
          alt="Indian food spread"
          width={2400}
          height={1350}
          sizes="100vw"
          priority={false}
          style={{ width: "100%", height: "420px", display: "block", objectFit: "cover", borderRadius: "0 0 16px 16px" }}
        />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)", borderRadius: "0 0 16px 16px", pointerEvents: "none" }} />
      </section>

      {/* ACTIVE DROPS — DropsSection handles all edge cases */}
      <DropsSection drops={drops} onData={setDropsData} />

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: "80px 20px", background: T.color.n0 }}><div style={{ maxWidth: "1120px", margin: "0 auto" }}><SH label="How It Works" title="Three steps. No app to download." /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "24px" }}>{[{ icon: Icon.msg, t: "Get alerted", d: "Text alert when new drops go live in your area." },{ icon: Icon.phone, t: "Reserve fast", d: "Prepay to lock in your order before it sells out." },{ icon: Icon.qr, t: "Pick it up", d: "Show your QR code at the restaurant and enjoy." }].map((s, i) => { const [r, v] = useInView(); return (<div key={i} ref={r} style={{ textAlign: "center", padding: "32px 24px", borderRadius: T.radius.xl, border: `1px solid ${T.color.n200}`, opacity: v ? 1 : 0, animation: v ? `fadeUp 0.5s ease ${i * 120}ms both` : "none" }}><div style={{ width: "60px", height: "60px", borderRadius: T.radius.xl, background: T.color.fire50, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>{s.icon}</div><div style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 700, color: T.color.fire600, letterSpacing: "0.1em", marginBottom: "8px" }}>STEP {i + 1}</div><h3 style={{ fontFamily: T.font.display, fontSize: "20px", fontWeight: 700, color: T.color.n900, marginBottom: "8px" }}>{s.t}</h3><p style={{ fontFamily: T.font.display, fontSize: "14px", lineHeight: 1.6, color: T.color.n500 }}>{s.d}</p></div>); })}</div></div></section>

      {/* FOR RESTAURANTS */}
      <section id="for-restaurants" style={{ padding: "80px 20px", background: T.color.n0 }}><div style={{ maxWidth: "1120px", margin: "0 auto" }}><SH label="For Restaurants" title="Want to run a drop with DealsPro?" /><p style={{ fontFamily: T.font.display, fontSize: "16px", lineHeight: 1.65, color: T.color.n500, textAlign: "center", maxWidth: "640px", margin: "-32px auto 48px" }}>DealsPro helps restaurants launch limited pickup drops, collect prepaid orders, and measure demand — without POS integration.</p>{(() => { const [r, v] = useInView(); return (<div ref={r} className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "center", opacity: v ? 1 : 0, animation: v ? "fadeUp 0.5s ease both" : "none" }}><div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>{["Prepaid pickup orders", "Limited quantity", "Source attribution", "No POS integration required", "Run successful drops again"].map((p, i) => (<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}><div style={{ width: "26px", height: "26px", borderRadius: "50%", background: T.color.fire50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.color.fire600} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div><span style={{ fontFamily: T.font.display, fontSize: "15px", lineHeight: 1.5, color: T.color.n900, fontWeight: 500 }}>{p}</span></div>))}<div style={{ marginTop: "8px" }}><a href="mailto:sales@dealspro.ai?subject=Partner%20with%20DealsPro" style={{ textDecoration: "none" }}><Btn>Partner with DealsPro →</Btn></a></div></div><div style={{ background: T.color.n50, borderRadius: T.radius.xxl, padding: "28px 20px", border: `1px solid ${T.color.n200}` }}><div style={{ fontFamily: T.font.mono, fontSize: "10px", fontWeight: 700, color: T.color.n400, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "16px", textAlign: "center" }}>DROP CONFIRMATION FLOW</div>{[{ from: "sys", text: "🔔 New prepaid drop order!\n\nCustomer: Sarah M.\nDrop: Family Biryani Drop · $39\nPickup: Fri 6–8pm\n\nReply ACCEPT or DECLINE" },{ from: "rest", text: "ACCEPT" },{ from: "sys", text: "✅ Confirmed! Sarah has her QR code and pickup time." }].map((m, i) => (<div key={i} style={{ display: "flex", justifyContent: m.from === "rest" ? "flex-end" : "flex-start", marginBottom: "10px" }}><div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: "14px", background: m.from === "rest" ? T.color.ink : T.color.n0, color: m.from === "rest" ? "#fff" : T.color.n900, fontFamily: T.font.display, fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-line", boxShadow: T.shadow.sm, border: m.from === "sys" ? `1px solid ${T.color.n200}` : "none" }}>{m.text}</div></div>))}</div></div>); })()}</div></section>

      {/* FINAL CTA */}
      <section id="get-deals" style={{ background: `linear-gradient(135deg, ${T.color.fire500} 0%, ${T.color.n950} 100%)`, padding: "80px 20px", textAlign: "center" }}><div style={{ maxWidth: "520px", margin: "0 auto" }}><h2 style={{ fontFamily: T.font.display, fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: "12px" }}>Don't miss the next drop</h2><p style={{ fontFamily: T.font.display, fontSize: "16px", color: "rgba(255,255,255,0.75)", marginBottom: "32px", lineHeight: 1.5 }}>New restaurant drops go live every week. Limited quantity. Reserve before they're gone.</p><div style={{ display: "flex", justifyContent: "center" }}><CaptureForm dark /></div><div style={{ fontFamily: T.font.display, fontSize: "13px", color: "rgba(255,255,255,0.6)", marginTop: "24px" }}>Join 500+ Frisco foodies getting drop alerts</div></div></section>

      {/* FOOTER */}
      <footer style={{ background: T.color.n950, padding: "48px 20px 32px", borderTop: `1px solid ${T.color.n800}` }}><div className="fg" style={{ maxWidth: "1120px", margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "40px" }}><div><div style={{ marginBottom: "12px" }}><DPLogo size={32} dark /></div><p style={{ fontFamily: T.font.display, fontSize: "13px", color: T.color.n400, lineHeight: 1.6, maxWidth: "260px" }}>Limited restaurant drops near you — prepaid, reserved, picked up. Released weekly.</p></div>{[{ t: "Platform", l: [{n:"How It Works",h:"#how-it-works"},{n:"Live Drops",h:"#deals"},{n:"For Restaurants",h:"#for-restaurants"}] },{ t: "Company", l: [{n:"About",h:"#how-it-works"},{n:"Contact",h:"mailto:sales@dealspro.ai"},] },{ t: "Legal", l: [{n:"Terms of Service",h:"/terms"},{n:"Privacy Policy",h:"/privacy"},{n:"Opt-In Policy",h:"/opt-in"},{n:"Opt-Out Policy",h:"/opt-out"},{n:"Cookies",h:"/cookies"}] }].map(c => (<div key={c.t}><div style={{ fontFamily: T.font.display, fontSize: "12px", fontWeight: 600, color: T.color.n400, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>{c.t}</div>{c.l.map(l => <a key={l.n} href={l.h} style={{ display: "block", fontFamily: T.font.display, fontSize: "13px", color: T.color.n400, textDecoration: "none", marginBottom: "8px" }}>{l.n}</a>)}</div>))}</div><div style={{ maxWidth: "1120px", margin: "36px auto 0", paddingTop: "20px", borderTop: `1px solid ${T.color.n800}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><span style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400 }}>© 2026 DealsPro. All rights reserved.</span><div style={{ display: "flex", gap: "16px" }}>{["Twitter", "Instagram", "TikTok"].map(s => <a key={s} href="#" style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400, textDecoration: "none" }}>{s}</a>)}</div></div></footer>
    </div>
  );
}
