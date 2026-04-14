"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getDropItem, formatTimeWindow, formatDate, getTimeContext, getDiscountPct, canPurchase, isPickupInProgress, hasEnded } from "@/lib/constants";

const T = {
  red: "#F93A25",
  green: "#16A34A",
  amber: "#D97706",
  n0: "#FFFFFF",
  n50: "#F7F7F8",
  n200: "#E4E4E7",
  n400: "#A1A1AA",
  n500: "#52525B",
  n900: "#18181B",
  display: "'DM Sans', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export default function DealPage() {
  return (
    <Suspense fallback={null}>
      <DealPageInner />
    </Suspense>
  );
}

function DealPageInner() {
  const { id } = useParams<{ id: string }>();
  const item = getDropItem(id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Fetch spots
  useEffect(() => {
    if (!item) return;
    const fetchSpots = async () => {
      try {
        const res = await fetch(`/api/spots?id=${item.id}`);
        const data = await res.json();
        if (data.spots?.[item.id]) {
          setSpotsRemaining(data.spots[item.id].remaining);
        }
      } catch { /* silent */ }
    };
    fetchSpots();
    const iv = setInterval(fetchSpots, 15000);
    return () => clearInterval(iv);
  }, [item]);

  // Phone from localStorage
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    try { setPhone(localStorage.getItem("dp_phone") || ""); } catch { setPhone(""); }
  }, []);

  // ── Not found ──
  if (!item) {
    return (
      <div style={{ minHeight: "100vh", background: T.n50, fontFamily: T.display, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: T.n900, marginBottom: "12px" }}>Deal Not Found</h1>
          <a href="/" style={{ color: T.red, textDecoration: "none", fontWeight: 600 }}>← Back to DealsPro</a>
        </div>
      </div>
    );
  }

  // ── Derived state ──
  const remaining = spotsRemaining ?? item.total_spots;
  const sold = remaining <= 0;
  const ended = hasEnded(item);
  const pickupActive = isPickupInProgress(item);
  const cancelled = item.status === "cancelled";
  const disabled = !canPurchase(item) || sold || ended || pickupActive || cancelled;
  const pct = getDiscountPct(item);
  const hasImage = !!item.image_url;

  // Scarcity bar
  const spotsTotal = item.total_spots;
  const fillPct = spotsTotal > 0 ? ((spotsTotal - remaining) / spotsTotal) * 100 : 100;
  const barColor = sold ? T.red : remaining / spotsTotal > 0.5 ? T.green : remaining / spotsTotal > 0.25 ? T.amber : T.red;

  // Meta line
  const dayName = formatDate(item).split(",")[0]; // e.g. "Tuesday"
  const timeWindow = formatTimeWindow(item);
  const metaLine = `${item.restaurant_name} · ${dayName} · ${timeWindow}`;

  // ── Claim handler ──
  const handleClaim = async () => {
    setLoading(true);
    setError("");

    // Haptic feedback
    try { if (navigator.vibrate) navigator.vibrate(10); } catch {}

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone || undefined, drop_item_id: item.id, quantity: 1 }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        setShowConfirm(true);
        setTimeout(() => { window.location.href = data.checkoutUrl; }, 600);
      } else {
        setError(data.error || "Could not start checkout.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  };

  // ── CTA text ──
  const ctaText = loading
    ? "Redirecting..."
    : disabled
      ? (sold ? "Sold Out" : ended ? "Ended" : pickupActive ? "Closed" : cancelled ? "Cancelled" : "Unavailable")
      : `Claim for $${item.price.toFixed(2)}`;

  return (
    <div style={{
      minHeight: "100vh",
      minHeight: "100dvh" as string,
      background: T.n0,
      fontFamily: T.display,
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Redirect overlay */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ background: T.n0, borderRadius: "16px", padding: "32px 24px", textAlign: "center", maxWidth: "300px" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔒</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: T.n900 }}>Redirecting to checkout...</div>
          </div>
        </div>
      )}

      {/* ── 1) IMAGE ── */}
      <div style={{
        position: "relative",
        width: "100%",
        height: "clamp(180px, 30vw, 240px)",
        overflow: "hidden",
        background: "linear-gradient(135deg, #1f2937, #374151)",
        flexShrink: 0,
      }}>
        {hasImage && (
          <img
            src={item.image_url}
            alt={item.title}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
          />
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* ── 2) TITLE + META ── */}
        <div>
          <div style={{
            fontSize: "18px", fontWeight: 600, color: T.n900, lineHeight: 1.3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {item.title}
          </div>
          <div style={{
            fontSize: "14px", color: T.n500, marginTop: "4px",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {metaLine}
          </div>
        </div>

        {/* ── 3) PRICE ── */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontFamily: T.mono, fontSize: "28px", fontWeight: 800, color: T.red, lineHeight: 1 }}>
            ${item.price.toFixed(2)}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: "16px", color: T.n400, textDecoration: "line-through" }}>
            ${item.original_price.toFixed(2)}
          </span>
        </div>

        {/* ── 4) SCARCITY BAR ── */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: sold ? T.red : T.n500 }}>
              {sold ? "Sold Out" : `${remaining} / ${spotsTotal} spots left`}
            </span>
            {!disabled && (
              <span style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: T.red, background: "rgba(249,58,37,0.08)", padding: "3px 8px", borderRadius: "9999px" }}>
                {pct}% OFF
              </span>
            )}
          </div>
          <div style={{ width: "100%", height: 7, borderRadius: "9999px", background: T.n200, overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(fillPct, 100)}%`,
              height: "100%",
              borderRadius: "9999px",
              background: barColor,
              transition: "width 300ms ease, background 300ms ease",
            }} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: "10px", textAlign: "center",
            background: "rgba(249,58,37,0.08)", color: T.red, fontSize: "13px",
          }}>
            {error}
          </div>
        )}

        {/* ── 5) CTA BUTTON ── */}
        <button
          onClick={!disabled && !loading ? handleClaim : undefined}
          disabled={disabled || loading}
          style={{
            width: "100%",
            minHeight: 52,
            border: "none",
            borderRadius: "14px",
            background: disabled ? T.n200 : T.red,
            color: disabled ? T.n400 : T.n0,
            fontFamily: T.display,
            fontWeight: 700,
            fontSize: "17px",
            cursor: disabled || loading ? "default" : "pointer",
            transition: "all 150ms ease",
            boxShadow: disabled ? "none" : "0 4px 16px rgba(249,58,37,0.3)",
            flexShrink: 0,
          }}
        >
          {ctaText}
        </button>
      </div>
    </div>
  );
}
