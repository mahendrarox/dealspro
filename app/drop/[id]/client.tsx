"use client";

import { useState, useEffect } from "react";
import type { DropItem } from "@/lib/drops/types";
import { formatTimeWindow, formatDate, getDiscountPct, canPurchase, isPickupInProgress, hasEnded } from "@/lib/drops/helpers";

const T = {
  red: "#F93A25",
  green: "#16A34A",
  amber: "#D97706",
  n400: "#A1A1AA",
  n500: "#71717A",
  display: "'DM Sans', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export default function DealClient({ initialItem }: { initialItem: DropItem }) {
  const item = initialItem;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  // In-memory only — per-session. Clears on refresh (server re-checks then).
  const [alreadyClaimedMessage, setAlreadyClaimedMessage] = useState<string | null>(null);
  const [claimedForPhone, setClaimedForPhone] = useState<string | null>(null);

  // If the phone changes after an already-claimed response, reset the banner
  // so the user can retry with the new number.
  useEffect(() => {
    if (
      alreadyClaimedMessage &&
      claimedForPhone !== null &&
      phone !== null &&
      phone !== claimedForPhone
    ) {
      setAlreadyClaimedMessage(null);
      setClaimedForPhone(null);
    }
  }, [phone, alreadyClaimedMessage, claimedForPhone]);

  // Fetch live spots every 15s
  useEffect(() => {
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
  }, [item.id]);

  useEffect(() => {
    try { setPhone(localStorage.getItem("dp_phone") || ""); } catch { setPhone(""); }
  }, []);

  // ── Derived state ──
  const remaining = spotsRemaining ?? item.total_spots;
  const claimed = item.total_spots - remaining;
  const sold = remaining <= 0;
  const ended = hasEnded(item);
  const pickupActive = isPickupInProgress(item);
  const cancelled = item.status === "cancelled";
  const disabled = !canPurchase(item) || sold || ended || pickupActive || cancelled;
  const pct = getDiscountPct(item);
  const hasImage = !!item.image_url;

  const spotsTotal = item.total_spots;
  const fillPct = spotsTotal > 0 ? ((spotsTotal - remaining) / spotsTotal) * 100 : 100;
  const barColor = sold ? "#666" : remaining / spotsTotal > 0.5 ? T.green : remaining / spotsTotal > 0.25 ? T.amber : T.red;

  let scarcityText = "";
  if (sold) scarcityText = `${claimed} claimed · Sold Out`;
  else if (remaining === 1) scarcityText = `🔥 ${claimed} claimed · Last spot!`;
  else if (remaining === 2) scarcityText = `🔥 ${claimed} claimed · Only 2 left`;
  else if (remaining <= 5) scarcityText = `${claimed} claimed · Going fast · ${remaining} left`;
  else scarcityText = `${claimed} claimed · ${remaining} left`;

  // ── Quantity bounds: cap at min(4, spots_remaining); 1 minimum ──
  const maxQty = Math.max(1, Math.min(4, remaining));

  // Auto-clamp quantity downward if live spots drop below current selection.
  // Never let quantity exceed available remaining (prevents mid-session oversell).
  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty, quantity]);

  const dayName = formatDate(item).split(",")[0];
  const timeWindow = formatTimeWindow(item);

  const handleClaim = async () => {
    setLoading(true);
    setError("");
    try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10); } catch {}
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone || undefined, drop_item_id: item.id, quantity }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        setShowConfirm(true);
        setTimeout(() => { window.location.href = data.checkoutUrl; }, 600);
      } else if (data.error === "already_claimed") {
        setAlreadyClaimedMessage(data.message || "You've already claimed this drop.");
        setClaimedForPhone(phone ?? "");
        setError("");
        setLoading(false);
      } else {
        setError(data.error || "Could not start checkout.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  };

  const total = (item.price * quantity).toFixed(2);
  const alreadyClaimed = !!alreadyClaimedMessage;
  const ctaDisabled = disabled || alreadyClaimed;
  const ctaText = loading
    ? "Redirecting..."
    : alreadyClaimed
      ? "Already claimed"
      : disabled
        ? (sold ? "Sold Out" : ended ? "Ended" : pickupActive ? "Closed" : cancelled ? "Cancelled" : "Unavailable")
        : quantity === 1
          ? `Claim for $${total}`
          : `Claim ${quantity} Spots for $${total}`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0A0A0A",
      fontFamily: T.display,
      display: "flex",
      flexDirection: "column",
    }}>
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ background: "#1a1a1a", borderRadius: "16px", padding: "32px 24px", textAlign: "center", maxWidth: "300px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔒</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>Redirecting to checkout...</div>
          </div>
        </div>
      )}

      {/* HERO IMAGE */}
      <div style={{
        position: "relative",
        width: "100%",
        minHeight: 320,
        maxHeight: 400,
        aspectRatio: "16 / 9",
        overflow: "hidden",
        background: "linear-gradient(135deg, #1f2937, #374151)",
        flexShrink: 0,
      }}>
        {hasImage && (
          <img
            src={item.image_url}
            alt={item.title}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", display: "block" }}
          />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.4) 40%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 20px 16px", zIndex: 2 }}>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            {item.title}
          </div>
          <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", marginTop: "6px" }}>
            {item.restaurant_name} · {dayName} · {timeWindow}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: "20px 20px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Price */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <span style={{ fontFamily: T.mono, fontSize: "32px", fontWeight: 800, color: T.red, lineHeight: 1 }}>
            ${item.price.toFixed(2)}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: "16px", color: T.n500, textDecoration: "line-through" }}>
            ${item.original_price.toFixed(2)}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 800, color: T.green, background: "rgba(22,163,74,0.15)", padding: "3px 8px", borderRadius: "9999px" }}>
            {pct}% OFF
          </span>
        </div>

        {/* Scarcity */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: sold ? T.red : "rgba(255,255,255,0.7)" }}>
              {scarcityText}
            </span>
          </div>
          <div style={{ width: "100%", height: 6, borderRadius: "9999px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{
              width: `${Math.min(fillPct, 100)}%`,
              height: "100%",
              borderRadius: "9999px",
              background: barColor,
              transition: "width 300ms ease",
            }} />
          </div>
        </div>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: "10px", textAlign: "center",
            background: "rgba(249,58,37,0.15)", border: "1px solid rgba(249,58,37,0.3)",
            color: T.red, fontSize: "13px",
          }}>
            {error}
          </div>
        )}

        {alreadyClaimedMessage && (
          <div
            data-testid="already-claimed-banner"
            style={{
              background: "#F3F4F6",
              border: "1px solid #E5E7EB",
              borderRadius: "14px",
              padding: "18px 20px",
              textAlign: "center",
              color: "#111827",
              fontSize: "16px",
              lineHeight: 1.45,
              whiteSpace: "pre-line",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "9999px",
                background: "#DCFCE7",
                color: T.green,
                fontSize: "16px",
                fontWeight: 800,
              }}
            >
              ✓
            </span>
            {alreadyClaimedMessage}
          </div>
        )}

        {/* ── Quantity selector — hidden when sold-out ── */}
        {!sold && !disabled && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Quantity</span>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: "1.5px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: quantity <= 1 ? "rgba(255,255,255,0.25)" : "#fff",
                  fontSize: 20, fontWeight: 700,
                  cursor: quantity <= 1 ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 150ms ease",
                  fontFamily: T.display,
                }}
              >−</button>
              <span style={{
                fontFamily: T.mono, fontSize: 20, fontWeight: 800, color: "#fff",
                minWidth: 24, textAlign: "center",
              }}>{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                aria-label="Increase quantity"
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: "1.5px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: quantity >= maxQty ? "rgba(255,255,255,0.25)" : "#fff",
                  fontSize: 20, fontWeight: 700,
                  cursor: quantity >= maxQty ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 150ms ease",
                  fontFamily: T.display,
                }}
              >+</button>
            </div>
          </div>
        )}

        <button
          onClick={!ctaDisabled && !loading ? handleClaim : undefined}
          disabled={ctaDisabled || loading}
          style={{
            width: "100%",
            minHeight: 54,
            border: "none",
            borderRadius: "14px",
            background: ctaDisabled ? "rgba(255,255,255,0.08)" : T.red,
            color: ctaDisabled ? "rgba(255,255,255,0.4)" : "#fff",
            fontFamily: T.display,
            fontWeight: 700,
            fontSize: "17px",
            cursor: ctaDisabled || loading ? "default" : "pointer",
            transition: "all 150ms ease",
            boxShadow: ctaDisabled ? "none" : "0 4px 20px rgba(249,58,37,0.4)",
            flexShrink: 0,
          }}
        >
          {ctaText}
        </button>
      </div>
    </div>
  );
}
