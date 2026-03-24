"use client";

import { useState, useEffect, useRef } from "react";

const T = {
  color: {
    red50: "#FEE2E0", red100: "#F9A29A", red500: "#F93A25",
    red600: "#E0311F", red700: "#C72A1A",
    green50: "#DCFCE7", green500: "#16A34A",
    amber50: "#FEF3C7", amber500: "#D97706",
    n0: "#FFFFFF", n50: "#F7F7F8", n200: "#E4E4E7", n300: "#D4D4D8",
    n400: "#A1A1AA", n500: "#52525B", n800: "#1C1C21",
    n900: "#18181B", n950: "#111114",
  },
  font: { display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
    deal: "0 4px 20px rgba(249,58,37,0.12)",
    dealHover: "0 8px 30px rgba(249,58,37,0.2)",
    focus: "0 0 0 3px rgba(249,58,37,0.3)",
  },
  radius: { sm: "6px", md: "8px", lg: "12px", xl: "16px", xxl: "24px", full: "9999px" },
  tr: { fast: "150ms ease", base: "200ms ease", spring: "300ms cubic-bezier(0.34,1.56,0.64,1)" },
};

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }
  ::selection { background: ${T.color.red50}; color: ${T.color.red700}; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes checkPop { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:1} }
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

function formatPhone(val: string) {
  const d = val.replace(/\D/g, "").slice(0, 10);
  if (!d.length) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

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
        Deals<span style={{ color: T.color.red500 }}>Pro</span>
      </span>
    </div>
  );
}

function Badge({ type = "drop", children }) {
  const s = { drop: { bg: T.color.red500, c: "#fff" }, savings: { bg: T.color.green50, c: T.color.green500 }, soldOut: { bg: T.color.n200, c: T.color.n400 } }[type] || { bg: T.color.red500, c: "#fff" };
  return <span style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: T.radius.full, background: s.bg, color: s.c, display: "inline-block" }}>{children}</span>;
}

function Btn({ children, variant = "primary", full, disabled, onClick, style = {} }) {
  const [h, setH] = useState(false);
  const base = { fontFamily: T.font.display, fontWeight: 700, fontSize: "14px", letterSpacing: "0.03em", border: "none", cursor: disabled ? "not-allowed" : "pointer", borderRadius: T.radius.lg, transition: `all ${T.tr.base}`, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "14px 28px", width: full ? "100%" : undefined };
  const v = disabled ? { background: T.color.n200, color: T.color.n400 }
    : variant === "secondary" ? { background: "transparent", color: T.color.n900, border: `2px solid ${h ? T.color.n400 : T.color.n300}` }
    : { background: h ? T.color.red600 : T.color.red500, color: "#fff", boxShadow: h ? T.shadow.md : T.shadow.sm, transform: h ? "translateY(-1px)" : "none" };
  return <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={disabled ? undefined : onClick} style={{ ...base, ...v, ...style }}>{children}</button>;
}

// ── Capture Form: Real-time validation ────────────────
function CaptureForm({ dark }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [focus, setFocus] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const nameValid = name.trim().length > 0;
  const phoneValid = digits.length === 10;
  const allValid = nameValid && phoneValid && optIn;
  const digitsLeft = 10 - digits.length;

  const submit = async () => {
    if (!allValid || loading) return;
    setLoading(true);
    setSubmitError("");
    console.log("[Form] Submit received:", { name: name.trim(), phone: `+1${digits}` });
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: `+1${digits}`, optIn: true }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
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
      <div style={{ fontFamily: T.font.display, fontWeight: 700, fontSize: "20px", color: dark ? "#fff" : T.color.n900 }}>You're in, {name.trim().split(" ")[0]}!</div>
      <div style={{ fontFamily: T.font.display, fontSize: "14px", color: T.color.n400 }}>Check your phone for your first deals.</div>
    </div>
  );

  const nameErr = nameTouched && !nameValid;
  const phoneErr = phoneTouched && digits.length > 0 && !phoneValid;
  const nameBorder = nameErr ? "#DC2626" : nameValid && nameTouched ? T.color.green500 : focus === "name" ? T.color.red500 : T.color.n300;
  const phoneBorder = phoneErr ? "#DC2626" : phoneValid ? T.color.green500 : focus === "phone" ? T.color.red500 : T.color.n300;

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
        <div style={{ fontFamily: T.font.display, fontSize: "20px", fontWeight: 700, color: T.color.n900, marginBottom: "6px" }}>Get Exclusive Deals</div>
        <div style={{ fontFamily: T.font.display, fontSize: "14px", color: T.color.n500 }}>Sign up in 10 seconds. No app needed.</div>
      </div>

      {/* Name */}
      <div style={{ marginBottom: "16px" }}>
        <label style={{ display: "block", fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: labelColor, marginBottom: "6px", letterSpacing: "0.01em" }}>
          Your Name
        </label>
        <div style={{ position: "relative" }}>
          <input type="text" placeholder="e.g. Sarah" value={name}
            onChange={e => { setName(e.target.value); if (!nameTouched) setNameTouched(true); }}
            onFocus={() => setFocus("name")} onBlur={() => { setFocus(null); setNameTouched(true); }}
            style={{ width: "100%", padding: "16px 44px 16px 16px", border: `2px solid ${nameBorder}`, borderRadius: T.radius.lg, fontFamily: T.font.display, fontSize: "16px", fontWeight: 500, color: T.color.n900, background: inputBg, outline: "none", boxShadow: focus === "name" ? T.shadow.focus : "none", transition: `all ${T.tr.base}` }}
          />
          {nameTouched && (
            <div style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)" }}>
              {nameValid ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.color.green500} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Phone */}
      <div style={{ marginBottom: "20px" }}>
        <label style={{ display: "block", fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: labelColor, marginBottom: "6px", letterSpacing: "0.01em" }}>
          Phone Number
        </label>
        <div style={{ display: "flex", borderRadius: T.radius.lg, overflow: "hidden", border: `2px solid ${phoneBorder}`, boxShadow: focus === "phone" ? T.shadow.focus : "none", transition: `all ${T.tr.base}`, background: inputBg }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 14px", background: T.color.n200, borderRight: `1px solid ${T.color.n300}`, flexShrink: 0 }}>
            <img src="https://flagcdn.com/w40/us.png" alt="US" style={{ width: "20px", height: "14px", objectFit: "cover", borderRadius: "2px" }} />
            <span style={{ fontFamily: T.font.mono, fontSize: "14px", fontWeight: 700, color: T.color.n500 }}>+1</span>
          </div>
          <input type="tel" placeholder="(555) 123-4567" value={phone}
            onChange={e => { setPhone(formatPhone(e.target.value)); if (!phoneTouched) setPhoneTouched(true); }}
            onFocus={() => setFocus("phone")} onBlur={() => { setFocus(null); setPhoneTouched(true); }}
            onKeyDown={e => { if (e.key === "Enter" && allValid) submit(); }}
            style={{ flex: 1, padding: "16px 14px", border: "none", outline: "none", fontFamily: T.font.display, fontSize: "16px", fontWeight: 500, color: T.color.n900, background: "transparent", minWidth: 0 }}
          />
          {phoneTouched && digits.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", paddingRight: "14px" }}>
              {phoneValid ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.color.green500} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <span style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 700, color: T.color.amber500 }}>{digitsLeft} left</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Opt-in checkbox */}
      <div style={{
        background: T.color.n50,
        border: `1px solid ${T.color.n200}`,
        borderRadius: T.radius.lg,
        padding: "14px 16px",
        marginBottom: "20px",
      }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer" }}
          onClick={() => setOptIn(!optIn)}>
          <div style={{
            width: "24px", height: "24px", borderRadius: "6px", flexShrink: 0, marginTop: "1px",
            border: `2px solid ${optIn ? T.color.red500 : T.color.n300}`,
            background: optIn ? T.color.red500 : T.color.n0,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: `all ${T.tr.fast}`,
            boxShadow: optIn ? "0 2px 8px rgba(249,58,37,0.3)" : "none",
          }}>
            {optIn && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
          <span style={{ fontFamily: T.font.display, fontSize: "13px", lineHeight: 1.5, color: T.color.n500 }}>
            I agree to receive exclusive deal alerts and promotions via RCS/SMS. Message & data rates may apply. Reply STOP to unsubscribe anytime.
          </span>
        </label>
      </div>

      {/* Submit */}
      <button onClick={allValid && !loading ? submit : undefined} style={{
        width: "100%", padding: "18px 28px",
        border: "none",
        borderRadius: T.radius.lg, fontFamily: T.font.display, fontWeight: 700,
        fontSize: "16px", letterSpacing: "0.03em",
        background: allValid && !loading ? "linear-gradient(135deg, #F93A25 0%, #E0311F 100%)" : T.color.n200,
        color: allValid && !loading ? "#FFFFFF" : T.color.n400,
        cursor: allValid && !loading ? "pointer" : "default",
        transition: "all 250ms ease",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        boxShadow: allValid && !loading ? "0 4px 16px rgba(249,58,37,0.45), 0 1px 3px rgba(0,0,0,0.1)" : "none",
        transform: allValid && !loading ? "none" : "none",
      }}>
        {loading ? "Setting up checkout..." : allValid ? "Get My Deals" : !nameValid ? "Enter your name to continue" : !phoneValid ? (digits.length === 0 ? "Enter your phone number" : `${digitsLeft} digit${digitsLeft !== 1 ? "s" : ""} remaining`) : "Check the opt-in box above"}
        {allValid && !loading && <span style={{ fontSize: "18px" }}>→</span>}
      </button>

      {submitError && (
        <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: T.radius.md, background: "rgba(249,58,37,0.1)", border: "1px solid rgba(249,58,37,0.25)", fontFamily: T.font.display, fontSize: "13px", color: "#F93A25" }}>
          {submitError}
        </div>
      )}

      <div style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400, marginTop: "14px", textAlign: "center" }}>Free forever. No spam. Unsubscribe anytime.</div>
    </div>
  );
}

function DealCard({ deal, delay = 0 }) {
  const [h, setH] = useState(false);
  const [ref, vis] = useInView();
  const sold = deal.status === "sold-out";
  const pct = Math.round((1 - deal.dealPrice / deal.originalPrice) * 100);
  return (
    <div ref={ref} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: T.color.n0, borderRadius: T.radius.xl, overflow: "hidden", border: `1px solid ${T.color.n200}`, boxShadow: sold ? T.shadow.sm : h ? T.shadow.dealHover : T.shadow.deal, transform: h && !sold ? "translateY(-4px)" : "none", transition: `all ${T.tr.spring}`, opacity: vis ? 1 : 0, animation: vis ? `fadeUp 0.5s ease ${delay}ms both` : "none", position: "relative", filter: sold ? "grayscale(0.3)" : "none" }}>
      <div style={{ background: `linear-gradient(135deg, ${T.color.n950}, ${T.color.n800})`, padding: "20px", position: "relative" }}>
        {sold && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}><span style={{ fontFamily: T.font.mono, fontSize: "14px", fontWeight: 800, letterSpacing: "0.15em", color: T.color.n400, textTransform: "uppercase", background: "rgba(0,0,0,0.6)", padding: "8px 20px", borderRadius: T.radius.full }}>SOLD OUT</span></div>}
        <Badge>DROP</Badge>
        <div style={{ fontFamily: T.font.display, fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "12px" }}>{deal.restaurant}</div>
        <div style={{ fontFamily: T.font.display, fontSize: "13px", color: T.color.n400, marginTop: "4px" }}>{deal.cuisine} · {deal.distance}</div>
      </div>
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: T.font.mono, fontSize: "36px", fontWeight: 800, color: T.color.red500, lineHeight: 1 }}>${deal.dealPrice}</span>
          <span style={{ fontFamily: T.font.mono, fontSize: "18px", color: T.color.n400, textDecoration: "line-through" }}>${deal.originalPrice}</span>
          <Badge type="savings">{pct}% OFF</Badge>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: sold ? T.color.n400 : T.color.amber500 }}>{sold ? "All claimed this week" : `🔥 Only ${deal.remaining} left`}</span>
          {!sold && <span style={{ fontFamily: T.font.mono, fontSize: "12px", fontWeight: 700, color: T.color.red500, background: T.color.red50, padding: "4px 10px", borderRadius: T.radius.full }}>{deal.expiresIn}</span>}
        </div>
        <Btn full disabled={sold}>{sold ? "Sold Out" : "Grab This Drop"}</Btn>
      </div>
    </div>
  );
}

const Icon = {
  phone: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.color.red500} strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  msg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.color.red500} strokeWidth="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  qr: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.color.red500} strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>,
  check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.color.green500} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  menu: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const deals = [
  { id: 1, restaurant: "Sakura Ramen House", cuisine: "Japanese", distance: "0.3mi", originalPrice: 50, dealPrice: 25, remaining: 5, expiresIn: "2h 14m", status: "active" },
  { id: 2, restaurant: "Tandoori Nights", cuisine: "Indian", distance: "1.2mi", originalPrice: 40, dealPrice: 20, remaining: 8, expiresIn: "5h 30m", status: "active" },
  { id: 3, restaurant: "Bella Napoli", cuisine: "Italian", distance: "0.8mi", originalPrice: 60, dealPrice: 30, remaining: 0, expiresIn: "0h 0m", status: "sold-out" },
];

export default function App() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => { const fn = () => setScrolled(window.scrollY > 60); window.addEventListener("scroll", fn, { passive: true }); return () => window.removeEventListener("scroll", fn); }, []);

  const SH = ({ label, title, dark, center = true }) => { const [r, v] = useInView(); return (<div ref={r} style={{ textAlign: center ? "center" : "left", marginBottom: "48px", opacity: v ? 1 : 0, animation: v ? "fadeUp 0.5s ease both" : "none" }}><div style={{ fontFamily: T.font.display, fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.color.red500, marginBottom: "12px" }}>{label}</div><h2 style={{ fontFamily: T.font.display, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: dark ? "#fff" : T.color.n900 }}>{title}</h2></div>); };

  return (
    <div style={{ fontFamily: T.font.display, color: T.color.n900, background: T.color.n0, overflowX: "hidden" }}>
      <style>{css}</style>
      <style>{`@media(max-width:768px){.dk{display:none!important}.mb{display:block!important}.hg{grid-template-columns:1fr!important;text-align:center}.hg>div:first-child{display:flex;flex-direction:column;align-items:center}.rg{grid-template-columns:1fr!important}.fg{grid-template-columns:1fr 1fr!important}}@media(max-width:480px){.fg{grid-template-columns:1fr!important}}`}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: scrolled ? "rgba(255,255,255,0.92)" : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: scrolled ? `1px solid ${T.color.n200}` : "1px solid transparent", transition: "all 0.3s ease", padding: "0 20px" }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <DPLogo size={scrolled ? 34 : 38} dark={!scrolled} />
          <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
            <div className="dk" style={{ display: "flex", gap: "28px" }}>{["How It Works", "For Restaurants", "For Creators"].map(l => <a key={l} href={`#${l.toLowerCase().replace(/\s+/g,"-")}`} style={{ fontFamily: T.font.display, fontSize: "14px", fontWeight: 500, color: scrolled ? T.color.n500 : "rgba(255,255,255,0.7)", textDecoration: "none" }}>{l}</a>)}</div>
            <a href="#get-deals" className="dk" style={{ textDecoration: "none" }}><Btn style={{ padding: "10px 20px", fontSize: "13px" }}>Get Deals</Btn></a>
            <button className="mb" onClick={() => setMobileNav(true)} style={{ background: "none", border: "none", cursor: "pointer", color: scrolled ? T.color.n900 : "#fff", display: "none" }}>{Icon.menu}</button>
          </div>
        </div>
      </nav>
      {mobileNav && <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)" }} onClick={() => setMobileNav(false)}><div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "280px", background: T.color.n0, padding: "24px" }} onClick={e => e.stopPropagation()}><button onClick={() => setMobileNav(false)} style={{ background: "none", border: "none", cursor: "pointer", position: "absolute", top: "20px", right: "20px", color: T.color.n900 }}>{Icon.close}</button><div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "48px" }}>{["How It Works", "For Restaurants", "For Creators"].map(l => <a key={l} href={`#${l.toLowerCase().replace(/\s+/g,"-")}`} onClick={() => setMobileNav(false)} style={{ fontFamily: T.font.display, fontSize: "18px", fontWeight: 600, color: T.color.n900, textDecoration: "none" }}>{l}</a>)}<a href="#get-deals" onClick={() => setMobileNav(false)} style={{ textDecoration: "none" }}><Btn full>Get Deals</Btn></a></div></div></div>}

      {/* HERO */}
      <section style={{ background: `linear-gradient(170deg, ${T.color.n950} 0%, #0D0D10 60%, ${T.color.n800} 100%)`, padding: "120px 20px 80px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: `radial-gradient(${T.color.n400} 1px, transparent 1px)`, backgroundSize: "24px 24px" }}/>
        <div style={{ position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px", background: "radial-gradient(circle, rgba(249,58,37,0.08) 0%, transparent 70%)", borderRadius: "50%" }}/>
        <div className="hg" style={{ maxWidth: "1120px", margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "60px", alignItems: "center" }}>
          <div style={{ animation: "fadeUp 0.6s ease both" }}>
            <h1 style={{ fontFamily: T.font.display, fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.03em", color: "#fff", marginBottom: "20px" }}>Exclusive Restaurant Deals. <span style={{ color: T.color.red500 }}>Limited Drops.</span> Sent to Your Phone.</h1>
            <p style={{ fontFamily: T.font.display, fontSize: "17px", lineHeight: 1.6, color: T.color.n400, marginBottom: "32px", maxWidth: "480px" }}>Exclusive limited-time deals from top local restaurants — released weekly in small batches. Once they're claimed, they're gone. No app required.</p>
            <CaptureForm dark />
          </div>
          <div style={{ display: "flex", justifyContent: "center", animation: "fadeUp 0.6s ease 0.2s both" }}><div style={{ animation: "float 4s ease-in-out infinite", maxWidth: "340px", width: "100%" }}><DealCard deal={deals[0]} /></div></div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ padding: "80px 20px", background: T.color.n0 }}><div style={{ maxWidth: "1120px", margin: "0 auto" }}><SH label="How It Works" title="Three Steps to Exclusive Deals" /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "24px" }}>{[{ icon: Icon.phone, t: "Enter Your Name & Phone", d: "Sign up in 10 seconds. No app to download, no account to create." },{ icon: Icon.msg, t: "Get Weekly Deals", d: "Exclusive limited-time deals from local restaurants, delivered via text every week." },{ icon: Icon.qr, t: "Pay & Redeem", d: "Prepay online at the deal price. Show your QR code at the restaurant." }].map((s, i) => { const [r, v] = useInView(); return (<div key={i} ref={r} style={{ textAlign: "center", padding: "32px 24px", borderRadius: T.radius.xl, border: `1px solid ${T.color.n200}`, opacity: v ? 1 : 0, animation: v ? `fadeUp 0.5s ease ${i * 120}ms both` : "none" }}><div style={{ width: "60px", height: "60px", borderRadius: T.radius.xl, background: T.color.red50, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>{s.icon}</div><div style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 700, color: T.color.red500, letterSpacing: "0.1em", marginBottom: "8px" }}>STEP {i + 1}</div><h3 style={{ fontFamily: T.font.display, fontSize: "20px", fontWeight: 700, color: T.color.n900, marginBottom: "8px" }}>{s.t}</h3><p style={{ fontFamily: T.font.display, fontSize: "14px", lineHeight: 1.6, color: T.color.n500 }}>{s.d}</p></div>); })}</div></div></section>

      {/* FEATURED DEALS */}
      <section id="featured-deals" style={{ padding: "80px 20px", background: T.color.n50 }}><div style={{ maxWidth: "1120px", margin: "0 auto" }}><SH label="This Week's Drops" title="Deals Going Fast" /><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>{deals.map((d, i) => <DealCard key={d.id} deal={d} delay={i * 120} />)}</div></div></section>

      {/* FOR RESTAURANTS */}
      <section id="for-restaurants" style={{ padding: "80px 20px", background: T.color.n0 }}><div style={{ maxWidth: "1120px", margin: "0 auto" }}><SH label="For Restaurants" title="Fill Empty Tables Without Discounting Your Brand" />{(() => { const [r, v] = useInView(); return (<div ref={r} className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "center", opacity: v ? 1 : 0, animation: v ? "fadeUp 0.5s ease both" : "none" }}><div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>{["Limited to 20 deals per week — no Groupon floods", "Customers prepay — guaranteed revenue before they walk in", "Accept or decline each deal via text — full control", "No POS changes. No hardware. No setup fee."].map((p, i) => (<div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}><div style={{ width: "26px", height: "26px", borderRadius: "50%", background: T.color.green50, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}>{Icon.check}</div><span style={{ fontFamily: T.font.display, fontSize: "15px", lineHeight: 1.5, color: T.color.n900, fontWeight: 500 }}>{p}</span></div>))}<div style={{ marginTop: "8px" }}><a href="mailto:sales@dealspro.ai?subject=Restaurant%20Partnership%20Inquiry" style={{ textDecoration: "none" }}><Btn>Partner With Us →</Btn></a></div></div><div style={{ background: T.color.n50, borderRadius: T.radius.xxl, padding: "28px 20px", border: `1px solid ${T.color.n200}` }}><div style={{ fontFamily: T.font.mono, fontSize: "10px", fontWeight: 700, color: T.color.n400, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "16px", textAlign: "center" }}>SMS CONFIRMATION FLOW</div>{[{ from: "sys", text: "🔔 New DealsPro order!\n\nCustomer: Sarah M.\nDeal: $50 for $25\n\nReply ACCEPT or DECLINE" },{ from: "rest", text: "ACCEPT" },{ from: "sys", text: "✅ Confirmed! Sarah has been notified and will receive her QR code." }].map((m, i) => (<div key={i} style={{ display: "flex", justifyContent: m.from === "rest" ? "flex-end" : "flex-start", marginBottom: "10px" }}><div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: "14px", background: m.from === "rest" ? T.color.red500 : T.color.n0, color: m.from === "rest" ? "#fff" : T.color.n900, fontFamily: T.font.display, fontSize: "12px", lineHeight: 1.5, whiteSpace: "pre-line", boxShadow: T.shadow.sm, border: m.from === "sys" ? `1px solid ${T.color.n200}` : "none" }}>{m.text}</div></div>))}</div></div>); })()}</div></section>

      {/* FOR CREATORS */}
      <section id="for-creators" style={{ padding: "80px 20px", background: T.color.n950 }}><div style={{ maxWidth: "1120px", margin: "0 auto" }}><SH label="For Creators" title="Turn Your Followers Into Revenue" dark />{(() => { const [r, v] = useInView(); return (<div ref={r} className="rg" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", alignItems: "center", opacity: v ? 1 : 0, animation: v ? "fadeUp 0.5s ease both" : "none" }}><div><p style={{ fontFamily: T.font.display, fontSize: "17px", lineHeight: 1.7, color: T.color.n400, marginBottom: "28px" }}>Get your own DealsPro page. Share exclusive deals with your audience. Earn commission on every sale — no inventory, no shipping, no hassle.</p><div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "28px" }}>{["Avg $500/mo per creator", "10% commission", "Your own branded page"].map(s => <span key={s} style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 700, color: T.color.red500, background: "rgba(249,58,37,0.1)", padding: "8px 14px", borderRadius: T.radius.full }}>{s}</span>)}</div><a href="mailto:sales@dealspro.ai?subject=Creator%20Program%20Application" style={{ textDecoration: "none" }}><Btn>Become a Creator →</Btn></a></div><div style={{ background: T.color.n800, borderRadius: T.radius.xxl, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}><div style={{ padding: "10px 16px", background: T.color.n950, display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}><div style={{ display: "flex", gap: "5px" }}><div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#FF5F57" }}/><div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#FFBD2E" }}/><div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#28CA41" }}/></div><div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: T.radius.full, padding: "5px 12px", fontFamily: T.font.mono, fontSize: "11px", color: T.color.n400, textAlign: "center" }}>dealspro.ai/daborhood</div></div><div style={{ padding: "24px", textAlign: "center" }}><div style={{ width: "52px", height: "52px", borderRadius: "50%", background: `linear-gradient(135deg, ${T.color.red500}, ${T.color.amber500})`, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font.display, fontSize: "20px", fontWeight: 800, color: "#fff" }}>D</div><div style={{ fontFamily: T.font.display, fontSize: "16px", fontWeight: 700, color: "#fff" }}>@daborhood</div><div style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400, marginTop: "4px", marginBottom: "16px" }}>DFW's best food finds · 12.4K followers</div>{[{ n: "Sakura Ramen", p: "$25", w: "$50" }, { n: "Tandoori Nights", p: "$20", w: "$40" }].map((d, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: T.radius.lg, background: "rgba(255,255,255,0.04)", marginBottom: "8px", border: "1px solid rgba(255,255,255,0.06)" }}><div style={{ textAlign: "left" }}><div style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: "#fff" }}>{d.n}</div><div style={{ fontFamily: T.font.mono, fontSize: "11px", color: T.color.n400 }}><span style={{ color: T.color.red500, fontWeight: 700 }}>{d.p}</span> <span style={{ textDecoration: "line-through" }}>{d.w}</span></div></div><Badge>DROP</Badge></div>))}</div></div></div>); })()}</div></section>

      {/* FINAL CTA */}
      <section id="get-deals" style={{ background: `linear-gradient(135deg, ${T.color.red500} 0%, ${T.color.n950} 100%)`, padding: "80px 20px", textAlign: "center" }}><div style={{ maxWidth: "520px", margin: "0 auto" }}><h2 style={{ fontFamily: T.font.display, fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: "12px" }}>Don't Miss the Next Drop</h2><p style={{ fontFamily: T.font.display, fontSize: "16px", color: "rgba(255,255,255,0.7)", marginBottom: "32px", lineHeight: 1.5 }}>Exclusive limited-time restaurant deals drop every week. Limited spots. Be the first to know.</p><div style={{ display: "flex", justifyContent: "center" }}><CaptureForm dark /></div><div style={{ fontFamily: T.font.display, fontSize: "13px", color: "rgba(255,255,255,0.5)", marginTop: "24px" }}>Join 500+ DFW foodies already saving</div></div></section>

      {/* FOOTER */}
      <footer style={{ background: T.color.n950, padding: "48px 20px 32px", borderTop: `1px solid ${T.color.n800}` }}><div className="fg" style={{ maxWidth: "1120px", margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "40px" }}><div><div style={{ marginBottom: "12px" }}><DPLogo size={32} dark /></div><p style={{ fontFamily: T.font.display, fontSize: "13px", color: T.color.n400, lineHeight: 1.6, maxWidth: "260px" }}>Exclusive restaurant deals, limited weekly drops, delivered to your phone.</p></div>{[{ t: "Platform", l: [{n:"How It Works",h:"#how-it-works"},{n:"Featured Deals",h:"#featured-deals"},{n:"For Restaurants",h:"#for-restaurants"},{n:"For Creators",h:"#for-creators"}] },{ t: "Company", l: [{n:"About",h:"#how-it-works"},{n:"Contact",h:"mailto:sales@dealspro.ai"},] },{ t: "Legal", l: [{n:"Terms of Service",h:"/terms"},{n:"Privacy Policy",h:"/privacy"},{n:"Opt-In Policy",h:"/opt-in"},{n:"Opt-Out Policy",h:"/opt-out"},{n:"Cookies",h:"/cookies"}] }].map(c => (<div key={c.t}><div style={{ fontFamily: T.font.display, fontSize: "12px", fontWeight: 600, color: T.color.n400, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>{c.t}</div>{c.l.map(l => <a key={l.n} href={l.h} style={{ display: "block", fontFamily: T.font.display, fontSize: "13px", color: T.color.n400, textDecoration: "none", marginBottom: "8px" }}>{l.n}</a>)}</div>))}</div><div style={{ maxWidth: "1120px", margin: "36px auto 0", paddingTop: "20px", borderTop: `1px solid ${T.color.n800}`, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}><span style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400 }}>© 2026 DealsPro. All rights reserved.</span><div style={{ display: "flex", gap: "16px" }}>{["Twitter", "Instagram", "TikTok"].map(s => <a key={s} href="#" style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400, textDecoration: "none" }}>{s}</a>)}</div></div></footer>
    </div>
  );
}
