"use client";

import { useState, useEffect, useRef } from "react";
import type { DropItem } from "@/lib/drops/types";
import {
  formatTimeWindow,
  formatDate,
  getTimeContext,
  canPurchase,
  isPickupInProgress,
  hasEnded,
} from "@/lib/drops/helpers";
import { useUserLocation } from "@/lib/hooks/useUserLocation";
import {
  isActiveDrop,
  isSoldOutDrop,
  selectFeatured,
  getRemainingDrops,
} from "@/lib/drops";
import { DP } from "@/lib/theme/tokens";

// ── Design tokens (shared with Homepage) ──
// Color values are sourced from the centralized DealsPro token file so the
// cards, CTAs and urgency states share one source of truth. Local names are
// kept so existing usage sites (T.color.fire500, …) are unchanged.

const T = {
  color: {
    // DealsPro fire accent (red/orange) — primary CTA buttons + urgency.
    fire50: DP.brand[50], fire100: DP.brand[100], orange400: DP.brand.orange400,
    fire500: DP.brand[500], fire600: DP.brand[600], fire700: DP.brand[700],
    red50: DP.brand[50], red100: DP.brand.softRed100, red500: DP.brand[500],
    red600: DP.brand[600], red700: DP.brand[700],
    green50: DP.success.bg, green500: DP.success.fg,
    amber50: DP.warning.bg, amber500: DP.warning.fg,
    n0: DP.zinc[0], n50: DP.zinc[50], n200: DP.zinc[200], n300: DP.zinc[300],
    n400: DP.zinc[400], n500: DP.zinc[600], n800: DP.zinc[800],
    n900: DP.zinc[900], n950: DP.zinc[950],
  },
  font: { display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
  shadow: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
    deal: "0 10px 30px rgba(24,24,24,0.10)",
    dealHover: "0 18px 44px rgba(24,24,24,0.16)",
  },
  radius: { sm: "6px", md: "8px", lg: "12px", xl: "16px", xxl: "24px", full: "9999px" },
  tr: { fast: "150ms ease", base: "200ms ease", spring: "300ms cubic-bezier(0.34,1.56,0.64,1)" },
};

// ── Hooks ──

function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.unobserve(el); } },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, v] as const;
}

// ── Sub-components ──

function Badge({ type = "drop", children }: { type?: "drop" | "savings" | "soldOut"; children: React.ReactNode }) {
  const s = { drop: { bg: T.color.fire50, c: T.color.fire700 }, savings: { bg: T.color.green50, c: T.color.green500 }, soldOut: { bg: T.color.n200, c: T.color.n400 } }[type] || { bg: T.color.fire50, c: T.color.fire700 };
  return <span style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: T.radius.full, background: s.bg, color: s.c, display: "inline-block" }}>{children}</span>;
}

function Btn({ children, full, disabled }: { children: React.ReactNode; full?: boolean; disabled?: boolean }) {
  const [h, setH] = useState(false);
  const base: React.CSSProperties = { fontFamily: T.font.display, fontWeight: 700, fontSize: "14px", letterSpacing: "0.03em", border: "none", cursor: disabled ? "not-allowed" : "pointer", borderRadius: T.radius.lg, transition: `all ${T.tr.base}`, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "14px 28px", width: full ? "100%" : undefined };
  const v = disabled
    ? { background: T.color.n200, color: T.color.n400 }
    : { background: h ? T.color.fire600 : T.color.fire500, color: "#fff", boxShadow: h ? T.shadow.md : T.shadow.sm, transform: h ? "translateY(-1px)" : "none" };
  return <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ ...base, ...v }}>{children}</button>;
}

export function DropCard({ item, spotsRemaining, delay = 0, distance, isAboveFold = false, featured = false }: { item: DropItem; spotsRemaining: number; delay?: number; distance?: string | null; isAboveFold?: boolean; featured?: boolean }) {
  const [h, setH] = useState(false);
  const [ref, vis] = useInView();
  const remaining = spotsRemaining;
  const claimed = item.total_spots - remaining;
  const sold = remaining <= 0;
  const ended = hasEnded(item);
  const pickupActive = isPickupInProgress(item);
  const timeCtx = getTimeContext(item);
  const disabled = sold || ended || pickupActive;

  const hasImage = !!item.image_url;

  // ── Urgency tier ──
  type Tier = "normal" | "medium" | "critical" | "last" | "sold_out";
  let tier: Tier = "normal";
  if (sold) tier = "sold_out";
  else if (remaining === 1) tier = "last";
  else if (remaining === 2) tier = "critical";
  else if (remaining >= 3 && remaining <= 5) tier = "medium";

  // ── Scarcity messaging (claimed-count tiers) ──
  let statusText = "";
  let statusColor = T.color.n500;
  if (ended) { statusText = "This drop has ended"; statusColor = T.color.n400; }
  else if (pickupActive) { statusText = "Ordering closed · Pickup in progress"; statusColor = T.color.n400; }
  else if (tier === "sold_out") { statusText = `${claimed} claimed · Sold Out`; statusColor = T.color.n400; }
  else if (tier === "last") { statusText = `🔥 ${claimed} claimed · Last spot!`; statusColor = T.color.red500; }
  else if (tier === "critical") { statusText = `🔥 ${claimed} claimed · Only 2 left`; statusColor = T.color.red500; }
  else if (tier === "medium") { statusText = `${claimed} claimed · Going fast · ${remaining} left`; statusColor = T.color.amber500; }
  else { statusText = `${claimed} claimed · ${remaining} left`; statusColor = T.color.n500; }

  // ── Pulse dot ──
  const pulseColor = tier === "medium" ? DP.accent.pulseMedium : (tier === "critical" || tier === "last") ? DP.accent.pulseCritical : null;

  // ── Progress bar ──
  const fillPct = item.total_spots > 0 ? ((item.total_spots - remaining) / item.total_spots) * 100 : 100;
  const barGradient = {
    sold_out: DP.gradient.barSoldOut,
    critical: DP.gradient.barCriticalLast,
    last: DP.gradient.barCriticalLast,
    medium: DP.gradient.barMedium,
    normal: DP.gradient.barNormal,
  }[tier];

  // ── Card styles (sold-out fully disabled) ──
  const cardShadow = sold ? "0 4px 16px rgba(0,0,0,0.2)" : h ? T.shadow.dealHover : T.shadow.deal;
  const cardTransform = h && !disabled ? "translateY(-4px)" : "none";
  const cardOpacity = sold ? 0.75 : 1;
  const cardCursor = sold ? "default" : "pointer";

  return (
    <a href={sold ? undefined : `/drop/${item.id}`} style={{ textDecoration: "none", display: "block", pointerEvents: sold ? "none" : undefined }}>
    <div ref={ref} onMouseEnter={() => !sold && setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: T.color.n0, borderRadius: T.radius.xl, overflow: "hidden", border: `1px solid ${T.color.n200}`, boxShadow: cardShadow, transform: cardTransform, transition: `all ${T.tr.spring}`, opacity: vis ? cardOpacity : 0, animation: vis ? `fadeUp 0.5s ease ${delay}ms both` : "none", cursor: cardCursor }}>
      {/* ── Image section ── */}
      <div style={{ position: "relative", width: "100%", height: featured ? 240 : 200, overflow: "hidden", background: DP.gradient.imageFallbackSlate }}>
        {hasImage && (
          <img
            src={item.image_url}
            alt={item.title}
            loading={isAboveFold ? "eager" : "lazy"}
            fetchPriority={isAboveFold ? "high" : "auto"}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
          />
        )}
        {/* DROP badge — only overlay on image */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 2 }}>
          <Badge>DROP</Badge>
        </div>
      </div>
      {/* ── Content section ── */}
      <div style={{ padding: "14px 16px" }}>
        {/* Title + meta */}
        <div style={{ opacity: sold ? 0.5 : 1 }}>
          <div style={{ fontFamily: T.font.display, fontSize: "18px", fontWeight: 600, color: T.color.n900, lineHeight: 1.3 }}>{item.title}</div>
          <div style={{ fontFamily: T.font.display, fontSize: "13px", color: T.color.n500, marginTop: "4px" }}>{item.restaurant_name} · {formatDate(item)}</div>
          {(item.address || distance) && (
            <div style={{ fontFamily: T.font.display, fontSize: "12px", color: T.color.n400, marginTop: "4px" }}>📍 {item.address ?? ""}{item.address && distance ? " · " : ""}{distance ?? ""}</div>
          )}
          <div style={{ fontFamily: T.font.mono, fontSize: "12px", color: T.color.n400, marginTop: "4px" }}>⏰ {formatTimeWindow(item)}</div>
        </div>
        {/* Pricing — single prepaid price (premium, no coupon-style % off) */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: T.font.mono, fontSize: "32px", fontWeight: 800, color: T.color.n900, lineHeight: 1 }}>${item.price.toFixed(2)}</span>
          <span style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: T.color.n400 }}>prepaid · pickup</span>
        </div>
        {/* Progress bar */}
        <div style={{ width: "100%", height: 6, borderRadius: "9999px", background: T.color.n200, overflow: "hidden", marginTop: "12px" }}>
          <div style={{ width: `${Math.min(fillPct, 100)}%`, height: "100%", borderRadius: "9999px", background: barGradient, transition: "width 300ms ease" }} />
        </div>
        {/* Engagement + time */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", marginBottom: "14px" }}>
          <span style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: statusColor, display: "flex", alignItems: "center", gap: "6px" }}>
            {pulseColor && <span style={{ width: 8, height: 8, borderRadius: "50%", background: pulseColor, display: "inline-block", animation: "pulseDot 1.5s ease-in-out infinite" }} />}
            {statusText}
          </span>
          {!disabled && <span style={{ fontFamily: T.font.mono, fontSize: "12px", fontWeight: 700, color: T.color.fire700, background: T.color.fire50, padding: "4px 10px", borderRadius: T.radius.full }}>{timeCtx}</span>}
        </div>
        {/* CTA */}
        {sold ? (
          <button style={{ width: "100%", fontFamily: T.font.display, fontWeight: 700, fontSize: "14px", letterSpacing: "0.03em", border: "none", borderRadius: T.radius.lg, padding: "14px 28px", background: DP.disabled.soldBg, color: DP.disabled.soldFg, cursor: "default", opacity: 0.7 }}>Sold Out</button>
        ) : (
          <Btn full disabled={disabled}>{disabled ? (ended ? "Ended" : "Ordering Closed") : `Reserve · $${item.price.toFixed(2)}`}</Btn>
        )}
      </div>
    </div>
    </a>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  const [ref, vis] = useInView();
  return (
    <div ref={ref} style={{ textAlign: "center", marginBottom: "48px", opacity: vis ? 1 : 0, animation: vis ? "fadeUp 0.5s ease both" : "none" }}>
      <div style={{ fontFamily: T.font.display, fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.color.fire600, marginBottom: "12px" }}>{label}</div>
      <h2 style={{ fontFamily: T.font.display, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: T.color.n900 }}>{title}</h2>
    </div>
  );
}

function Shimmer() {
  return (
    <div style={{ maxWidth: "400px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      <style>{`@keyframes shimmer { 0% { opacity: 0.4; } 100% { opacity: 0.7; } }`}</style>
      {[0, 1].map((i) => (
        <div key={i} style={{ background: T.color.n0, borderRadius: T.radius.xl, overflow: "hidden", border: `1px solid ${T.color.n200}` }}>
          <div style={{ background: T.color.n200, height: "140px", animation: "shimmer 1.5s ease-in-out infinite alternate" }} />
          <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: T.color.n200, height: "28px", width: "60%", borderRadius: T.radius.md, animation: "shimmer 1.5s ease-in-out infinite alternate" }} />
            <div style={{ background: T.color.n200, height: "16px", width: "80%", borderRadius: T.radius.md, animation: "shimmer 1.5s ease-in-out infinite alternate" }} />
            <div style={{ background: T.color.n200, height: "48px", borderRadius: T.radius.lg, animation: "shimmer 1.5s ease-in-out infinite alternate" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sample drops showcase ─────────────────────────────────────────────
// Premium static cards shown when there are no live DB drops yet, so the
// "Live drops near you" section always presents the product the way the
// reference design intends. Real DB drops (when active) render instead via
// <DropCard/> above. "Reserve" routes to the opt-in so visitors get alerted
// the moment real drops go live.
const SAMPLE_DROPS = [
  { tag: "DROP EXCLUSIVE", title: "Family Biryani Drop", place: "Sai Gayatri · Frisco", left: "Only 12 left", pickup: "Pickup Fri 6–8pm", price: "$39", detail: "Feeds 4–5", emoji: "🍛", grad: DP.gradient.card1 },
  { tag: "WEEKEND ONLY", title: "BBQ Family Platter", place: "Smokey's · Prosper", left: "Only 6 left", pickup: "Pickup Sat 12–2pm", price: "$45", detail: "Feeds 4", emoji: "🍖", grad: DP.gradient.card2 },
  { tag: "LIMITED BATCH", title: "Weekend Dessert Box", place: "Sweet Lane · Frisco", left: "Only 8 left", pickup: "Pickup Sun 10am–12pm", price: "$24", detail: "6 pieces", emoji: "🧁", grad: DP.gradient.card3 },
];

function SampleDropCard({ d, delay }: { d: typeof SAMPLE_DROPS[number]; delay: number }) {
  const [h, setH] = useState(false);
  const [ref, vis] = useInView();
  return (
    <a href="#get-deals" style={{ textDecoration: "none", display: "block" }}>
      <div
        ref={ref}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
        style={{
          background: T.color.n0, borderRadius: T.radius.xl, overflow: "hidden",
          border: `1px solid ${T.color.n200}`,
          boxShadow: h ? T.shadow.dealHover : T.shadow.deal,
          transform: h ? "translateY(-4px)" : "none",
          transition: `all ${T.tr.spring}`,
          opacity: vis ? 1 : 0, animation: vis ? `fadeUp 0.5s ease ${delay}ms both` : "none",
          height: "100%", display: "flex", flexDirection: "column",
        }}
      >
        {/* Image area (gradient placeholder) */}
        <div style={{ position: "relative", height: 176, background: d.grad, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "64px", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.25))" }}>{d.emoji}</span>
          <div style={{ position: "absolute", top: 12, left: 12 }}>
            <span style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", padding: "5px 12px", borderRadius: T.radius.full, background: "rgba(255,255,255,0.92)", color: T.color.fire700, display: "inline-block" }}>{d.tag}</span>
          </div>
          {/* Urgency — dominant solid fire pill with a live pulse dot */}
          <div style={{ position: "absolute", top: 12, right: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: T.font.display, fontSize: "12.5px", fontWeight: 800, letterSpacing: "0.01em", padding: "6px 12px", borderRadius: T.radius.full, background: T.color.fire500, color: "#fff", boxShadow: `0 6px 16px ${DP.brandAlpha(0.42)}` }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "pulseDot 1.5s ease-in-out infinite" }} />
              {d.left}
            </span>
          </div>
        </div>
        {/* Content */}
        <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontFamily: T.font.display, fontSize: "20px", fontWeight: 800, color: T.color.n900, lineHeight: 1.2, letterSpacing: "-0.01em" }}>{d.title}</div>
          <div style={{ fontFamily: T.font.display, fontSize: "13px", color: T.color.n500, marginTop: "4px" }}>{d.place}</div>
          {/* Pickup chip — scannable */}
          <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: "6px", marginTop: "12px", padding: "6px 11px", borderRadius: T.radius.full, background: T.color.fire50, border: `1px solid ${T.color.fire100}` }}>
            <span style={{ fontSize: "12px", lineHeight: 1 }}>⏰</span>
            <span style={{ fontFamily: T.font.display, fontSize: "12.5px", fontWeight: 700, color: T.color.fire700 }}>{d.pickup}</span>
          </div>
          {/* Price + detail */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "16px" }}>
            <div>
              <div style={{ fontFamily: T.font.mono, fontSize: "32px", fontWeight: 800, color: T.color.n900, lineHeight: 1 }}>{d.price}</div>
              <div style={{ fontFamily: T.font.display, fontSize: "11.5px", fontWeight: 600, color: T.color.n400, marginTop: "5px", letterSpacing: "0.02em" }}>prepaid · pickup</div>
            </div>
            <span style={{ fontFamily: T.font.display, fontSize: "12.5px", fontWeight: 700, color: T.color.n500, background: T.color.n50, border: `1px solid ${T.color.n200}`, padding: "6px 11px", borderRadius: T.radius.full }}>{d.detail}</span>
          </div>
          {/* Reserve — dominant black CTA */}
          <div style={{ marginTop: "18px" }}>
            <button style={{
              width: "100%", fontFamily: T.font.display, fontWeight: 800, fontSize: "15px", letterSpacing: "0.02em",
              border: "none", borderRadius: T.radius.lg, padding: "15px 20px",
              background: h ? T.color.fire600 : T.color.fire500, color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              boxShadow: h ? T.shadow.md : T.shadow.sm, transition: `all ${T.tr.base}`,
            }}>Reserve <span style={{ fontSize: "17px" }}>→</span></button>
          </div>
        </div>
      </div>
    </a>
  );
}

function SampleDrops() {
  return (
    <section id="deals" style={{ padding: "80px 20px", background: T.color.n50 }}>
      <style>{`@keyframes pulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.8)}}@media(max-width:900px){.drops-grid{grid-template-columns:1fr 1fr!important}}@media(max-width:600px){.drops-grid{grid-template-columns:1fr!important;max-width:400px;margin:0 auto}}`}</style>
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        <SectionHeader label="Live drops" title="Live drops near you" />
        <div className="drops-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", alignItems: "stretch" }}>
          {SAMPLE_DROPS.map((d, i) => <SampleDropCard key={d.title} d={d} delay={i * 120} />)}
        </div>
      </div>
    </section>
  );
}

// ── Exported spot data for hero featured card ──

export interface DropsData {
  featured: DropItem | null;
  spotsMap: Record<string, number>;
  loading: boolean;
  /** Count of genuinely active (claimable) drops — powers the hero live badge. */
  activeCount: number;
}

// ── Main component ──

interface DropsSectionProps {
  drops: DropItem[];
  onData?: (data: DropsData) => void;
}

// Pulse dot keyframe — injected once
function PulseDotStyle() {
  return <style>{`@keyframes pulseDot { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.8); } }`}</style>;
}

export default function DropsSection({ drops, onData }: DropsSectionProps) {
  const [mounted, setMounted] = useState(false);
  const [spotsMap, setSpotsMap] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const { coords, denied, loading: locLoading, requestLocation, getDistance } = useUserLocation();

  // Mark mounted after first client render to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch spots only after mount
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    async function fetchSpots() {
      try {
        const res = await fetch("/api/drops/spots");
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data: Record<string, number> = await res.json();
        if (!cancelled) setSpotsMap(data);
      } catch (err) {
        console.error("[DropsSection] Spots fetch failed, using optimistic fallback:", err);
        if (!cancelled) {
          const fallback: Record<string, number> = {};
          for (const d of drops) {
            fallback[d.id] = d.total_spots;
          }
          setSpotsMap(fallback);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSpots();
    return () => { cancelled = true; };
  }, [mounted, drops]);

  // Compute drop sets — only meaningful after mount + fetch, but must run every
  // render so hooks below always execute in the same order.
  const ready = mounted && !loading;
  const now = ready ? Date.now() : 0;
  const spots = spotsMap ?? (() => {
    const defaults: Record<string, number> = {};
    for (const d of drops) defaults[d.id] = d.total_spots;
    return defaults;
  })();

  const activeDrops = ready
    ? drops.filter((d) => isActiveDrop(d, spots[d.id] ?? d.total_spots, now))
    : [];
  const soldOutDrops = ready
    ? drops.filter((d) => isSoldOutDrop(d, spots[d.id] ?? d.total_spots, now))
    : [];
  // selectFeatured receives the full drops list so it can honor an
  // admin-set hero even when that drop's cutoff has passed (the
  // DropCard CTA layer renders the correct "Ended" / "Ordering Closed"
  // state for an expired hero).
  const featured = ready ? selectFeatured(drops, activeDrops, spots) : null;
  const remaining = featured ? getRemainingDrops(activeDrops, featured) : [];

  // Notify parent of computed data (for hero featured card)
  useEffect(() => {
    if (onData) {
      onData({ featured, spotsMap: spots, loading, activeCount: activeDrops.length });
    }
  }, [featured?.id, loading, spotsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Temporary logging
  useEffect(() => {
    if (ready) {
      console.log("[DropsSection]", {
        totalDrops: drops.length,
        activeCount: activeDrops.length,
        soldOutCount: soldOutDrops.length,
        featuredId: featured?.id ?? null,
        remainingCount: remaining.length,
      });
    }
  }, [ready, featured?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Before mount or while loading: render skeleton (matches server HTML exactly)
  if (!ready) {
    return (
      <section id="deals" style={{ padding: "80px 20px", background: T.color.n50 }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
          <SectionHeader label="Live drops" title="Live drops near you" />
          <Shimmer />
        </div>
      </section>
    );
  }

  // Case A: No active AND no sold-out drops → premium sample showcase so the
  // "Live drops near you" section always presents the product (real DB drops
  // replace these the moment any go live).
  if (activeDrops.length === 0 && soldOutDrops.length === 0) {
    return <SampleDrops />;
  }

  // Case B: All drops sold out
  if (activeDrops.length === 0 && soldOutDrops.length > 0) {
    return (
      <section id="deals" style={{ padding: "80px 20px", background: T.color.n50 }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: T.font.display, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: T.color.n900, marginBottom: "16px" }}>
            This week's drops sold out
          </div>
          <p style={{ fontFamily: T.font.display, fontSize: "16px", lineHeight: 1.6, color: T.color.n500, maxWidth: "480px", margin: "0 auto" }}>
            Next drops coming soon — stay tuned
          </p>
        </div>
      </section>
    );
  }

  // Case C: 1 active drop — featured only, shown in hero (no section here)
  if (remaining.length === 0) {
    return null;
  }

  // Case D: 2+ active drops — featured in hero, remaining in vertical list here
  return (
    <section id="deals" style={{ padding: "80px 20px", background: T.color.n50 }}>
      <PulseDotStyle />
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        <SectionHeader label="Live drops" title="Live drops near you" />
        {!coords && !denied && (
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <button onClick={requestLocation} disabled={locLoading} style={{ background: T.color.n0, border: `1px solid ${T.color.n200}`, borderRadius: T.radius.full, padding: "10px 20px", fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: T.color.n500, cursor: locLoading ? "default" : "pointer", transition: `all ${T.tr.base}`, boxShadow: T.shadow.sm }}>
              {locLoading ? "Getting location..." : "📍 Find drops closest to you"}
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "400px", width: "100%", margin: "0 auto" }}>
          {remaining.map((item, i) => (
            <DropCard
              key={item.id}
              item={item}
              spotsRemaining={spots[item.id] ?? item.total_spots}
              delay={i * 120}
              distance={getDistance(item.lat, item.lng)}
              isAboveFold={i < 2}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
