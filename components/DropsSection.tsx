"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DropItem } from "@/lib/constants";
import {
  formatTimeWindow,
  formatDate,
  getTimeContext,
  getDiscountPct,
  canPurchase,
  isPickupInProgress,
  hasEnded,
} from "@/lib/constants";
import { useUserLocation } from "@/lib/hooks/useUserLocation";
import {
  isActiveDrop,
  isSoldOutDrop,
  selectFeatured,
  getRemainingDrops,
} from "@/lib/drops";

// ── Design tokens (shared with Homepage) ──

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
  const s = { drop: { bg: T.color.red500, c: "#fff" }, savings: { bg: T.color.green50, c: T.color.green500 }, soldOut: { bg: T.color.n200, c: T.color.n400 } }[type] || { bg: T.color.red500, c: "#fff" };
  return <span style={{ fontFamily: T.font.mono, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: T.radius.full, background: s.bg, color: s.c, display: "inline-block" }}>{children}</span>;
}

function Btn({ children, full, disabled }: { children: React.ReactNode; full?: boolean; disabled?: boolean }) {
  const [h, setH] = useState(false);
  const base: React.CSSProperties = { fontFamily: T.font.display, fontWeight: 700, fontSize: "14px", letterSpacing: "0.03em", border: "none", cursor: disabled ? "not-allowed" : "pointer", borderRadius: T.radius.lg, transition: `all ${T.tr.base}`, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "14px 28px", width: full ? "100%" : undefined };
  const v = disabled
    ? { background: T.color.n200, color: T.color.n400 }
    : { background: h ? T.color.red600 : T.color.red500, color: "#fff", boxShadow: h ? T.shadow.md : T.shadow.sm, transform: h ? "translateY(-1px)" : "none" };
  return <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ ...base, ...v }}>{children}</button>;
}

export function DropCard({ item, spotsRemaining, delay = 0, distance }: { item: DropItem; spotsRemaining: number; delay?: number; distance?: string | null }) {
  const [h, setH] = useState(false);
  const [ref, vis] = useInView();
  const remaining = spotsRemaining;
  const claimed = item.total_spots - remaining;
  const sold = remaining <= 0;
  const ended = hasEnded(item);
  const pickupActive = isPickupInProgress(item);
  const pct = getDiscountPct(item);
  const timeCtx = getTimeContext(item);
  const disabled = sold || ended || pickupActive;

  let statusText = "";
  let statusColor = T.color.amber500;
  if (ended) { statusText = "This drop has ended"; statusColor = T.color.n400; }
  else if (pickupActive) { statusText = "Ordering closed · Pickup in progress"; statusColor = T.color.n400; }
  else if (sold) { statusText = "All spots claimed"; statusColor = T.color.n400; }
  else { statusText = remaining <= 3 ? `🔥 Only ${remaining} left` : `🔥 ${claimed} claimed`; }

  return (
    <a href={`/drop/${item.id}`} style={{ textDecoration: "none", display: "block" }}>
    <div ref={ref} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: T.color.n0, borderRadius: T.radius.xl, overflow: "hidden", border: `1px solid ${T.color.n200}`, boxShadow: disabled ? T.shadow.sm : h ? T.shadow.dealHover : T.shadow.deal, transform: h && !disabled ? "translateY(-4px)" : "none", transition: `all ${T.tr.spring}`, opacity: vis ? 1 : 0, animation: vis ? `fadeUp 0.5s ease ${delay}ms both` : "none", position: "relative", filter: disabled ? "grayscale(0.3)" : "none", cursor: "pointer" }}>
      <div style={{ background: `linear-gradient(135deg, ${T.color.n950}, ${T.color.n800})`, padding: "20px", position: "relative" }}>
        {sold && !ended && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}><span style={{ fontFamily: T.font.mono, fontSize: "14px", fontWeight: 800, letterSpacing: "0.15em", color: T.color.n400, textTransform: "uppercase", background: "rgba(0,0,0,0.6)", padding: "8px 20px", borderRadius: T.radius.full }}>SOLD OUT</span></div>}
        <Badge>DROP</Badge>
        <div style={{ fontFamily: T.font.display, fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "12px" }}>{item.title}</div>
        <div style={{ fontFamily: T.font.display, fontSize: "13px", color: T.color.n400, marginTop: "4px" }}>{item.restaurant_name} · {formatDate(item)}</div>
        <div style={{ fontFamily: T.font.display, fontSize: "11px", color: T.color.n400, marginTop: "4px" }}>📍 {item.address}{distance ? ` · ${distance}` : ""}</div>
        <div style={{ fontFamily: T.font.mono, fontSize: "11px", color: T.color.n400, marginTop: "6px" }}>⏰ {formatTimeWindow(item)}</div>
      </div>
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: T.font.mono, fontSize: "36px", fontWeight: 800, color: T.color.red500, lineHeight: 1 }}>${item.price.toFixed(2)}</span>
          <span style={{ fontFamily: T.font.mono, fontSize: "18px", color: T.color.n400, textDecoration: "line-through" }}>${item.original_price.toFixed(2)}</span>
          <Badge type="savings">{pct}% OFF</Badge>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: statusColor }}>{statusText}</span>
          {!disabled && <span style={{ fontFamily: T.font.mono, fontSize: "12px", fontWeight: 700, color: T.color.red500, background: T.color.red50, padding: "4px 10px", borderRadius: T.radius.full }}>{timeCtx}</span>}
        </div>
        <Btn full disabled={disabled}>{disabled ? (ended ? "Ended" : sold ? "Sold Out" : "Ordering Closed") : `Claim Spot for $${item.price.toFixed(2)}`}</Btn>
      </div>
    </div>
    </a>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  const [ref, vis] = useInView();
  return (
    <div ref={ref} style={{ textAlign: "center", marginBottom: "48px", opacity: vis ? 1 : 0, animation: vis ? "fadeUp 0.5s ease both" : "none" }}>
      <div style={{ fontFamily: T.font.display, fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T.color.red500, marginBottom: "12px" }}>{label}</div>
      <h2 style={{ fontFamily: T.font.display, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: T.color.n900 }}>{title}</h2>
    </div>
  );
}

function Shimmer() {
  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
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

// ── Exported spot data for hero featured card ──

export interface DropsData {
  featured: DropItem | null;
  spotsMap: Record<string, number>;
  loading: boolean;
}

// ── Main component ──

interface DropsSectionProps {
  drops: DropItem[];
  onData?: (data: DropsData) => void;
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
  const featured = ready ? selectFeatured(activeDrops, spots) : null;
  const remaining = featured ? getRemainingDrops(activeDrops, featured) : [];

  // Notify parent of computed data (for hero featured card)
  useEffect(() => {
    if (onData) {
      onData({ featured, spotsMap: spots, loading });
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
          <SectionHeader label="This Week's Drops" title="Active Drops Near You" />
          <Shimmer />
        </div>
      </section>
    );
  }

  // Case A: No active AND no sold-out drops
  if (activeDrops.length === 0 && soldOutDrops.length === 0) {
    return (
      <section id="deals" style={{ padding: "80px 20px", background: T.color.n50 }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontFamily: T.font.display, fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", color: T.color.n900, marginBottom: "16px" }}>
            New drops coming soon
          </div>
          <p style={{ fontFamily: T.font.display, fontSize: "16px", lineHeight: 1.6, color: T.color.n500, maxWidth: "480px", margin: "0 auto" }}>
            You'll be the first to know when the next deal goes live.
          </p>
        </div>
      </section>
    );
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
      <div style={{ maxWidth: "1120px", margin: "0 auto" }}>
        <SectionHeader label="This Week's Drops" title="Active Drops Near You" />
        {!coords && !denied && (
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <button onClick={requestLocation} disabled={locLoading} style={{ background: T.color.n0, border: `1px solid ${T.color.n200}`, borderRadius: T.radius.full, padding: "10px 20px", fontFamily: T.font.display, fontSize: "13px", fontWeight: 600, color: T.color.n500, cursor: locLoading ? "default" : "pointer", transition: `all ${T.tr.base}`, boxShadow: T.shadow.sm }}>
              {locLoading ? "Getting location..." : "📍 Find deals closest to you"}
            </button>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "480px", margin: "0 auto" }}>
          {remaining.map((item, i) => (
            <DropCard
              key={item.id}
              item={item}
              spotsRemaining={spots[item.id] ?? item.total_spots}
              delay={i * 120}
              distance={getDistance(item.lat, item.lng)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
