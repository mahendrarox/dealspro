"use client";

import { useState, useEffect, type CSSProperties } from "react";
import type { DropItem } from "@/lib/drops/types";
import {
  formatTimeWindow,
  formatDate,
  canPurchase,
  isPickupInProgress,
  hasEnded,
} from "@/lib/drops/helpers";

// ─── Theme — matches TicketCard.tsx visual language ──────────────────
const T = {
  page: "#0A0A0A",
  card: "#FFFFFF",
  dark: "#18181B",
  ink: "#161616",
  red: "#F93A25",
  redShadow: "0 4px 14px rgba(249, 58, 37, 0.35)",
  text: "#111827",
  textMuted: "#6B7280",
  textDim: "#9CA3AF",
  greenFg: "#059669",
  divider: "#E5E7EB",
  display: "'DM Sans', -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

function buildDirectionsUrl(item: DropItem): string | null {
  if (item.lat !== null && item.lng !== null && item.lat !== 0 && item.lng !== 0) {
    return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`;
  }
  if (item.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`;
  }
  return null;
}

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
  const hasImage = !!item.image_url;

  const spotsTotal = item.total_spots;
  const fillPct = spotsTotal > 0 ? (claimed / spotsTotal) * 100 : 100;
  const urgent = !sold && remaining <= 3;
  const scarcityText = sold ? "Sold out" : `🔥 Only ${remaining} left`;

  // ── Quantity bounds: cap at min(4, spots_remaining); 1 minimum ──
  const maxQty = Math.max(1, Math.min(4, remaining));

  // Auto-clamp quantity downward if live spots drop below current selection.
  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty, quantity]);

  const dayDate = formatDate(item);
  const timeWindow = formatTimeWindow(item);
  const directionsUrl = buildDirectionsUrl(item);

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
        ? (sold ? "Sold Out" : ended ? "Ended" : pickupActive ? "Pickup in progress" : cancelled ? "Cancelled" : "Unavailable")
        : quantity === 1
          ? `Claim for $${total}`
          : `Claim ${quantity} spots for $${total}`;

  const bandLabel: CSSProperties = {
    fontFamily: T.mono,
    fontSize: "11px",
    fontWeight: 700,
    color: T.red,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: "8px",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.page,
        fontFamily: T.display,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "16px 16px 96px",
        boxSizing: "border-box",
        WebkitTextSizeAdjust: "100%",
      }}
    >
      <style>{`
        .dp-when-where { display: flex; flex-direction: column; gap: 20px; }
        @media (min-width: 440px) {
          .dp-when-where { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        }
      `}</style>

      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#1a1a1a", borderRadius: "16px", padding: "32px 24px",
            textAlign: "center", maxWidth: "300px", border: "1px solid rgba(255,255,255,0.1)",
          }}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔒</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
              Redirecting to checkout...
            </div>
          </div>
        </div>
      )}

      {/* ── Contained card — matches homepage DropCard treatment ── */}
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: T.card,
          borderRadius: "16px",
          border: "1px solid #E4E4E7",
          boxShadow: "0 4px 20px rgba(249,58,37,0.12)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* ── 1. HERO IMAGE ── */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "3 / 2",
            maxHeight: "320px",
            overflow: "hidden",
            background: "linear-gradient(135deg, #1c1c1e, #2b2b2f)",
          }}
        >
          {hasImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.title}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "center", display: "block",
              }}
            />
          )}
          {/* DROP badge */}
          <div
            style={{
              position: "absolute", top: "14px", left: "14px", zIndex: 2,
              fontFamily: T.mono, fontSize: "11px", fontWeight: 800,
              letterSpacing: "0.12em", color: "#fff",
              background: T.red, padding: "5px 12px", borderRadius: "9999px",
              boxShadow: T.redShadow,
            }}
          >
            DROP
          </div>
          {/* Gradient scrim + title */}
          <div
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.35) 42%, transparent 68%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 20px 18px", zIndex: 2 }}>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              {item.title}
            </div>
          </div>
        </div>

        {/* ── White content: price + scarcity ── */}
        <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* ── 2. PRICE — single prepaid price, no discount framing ── */}
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "10px" }}>
            <span style={{ fontFamily: T.mono, fontSize: "38px", fontWeight: 800, color: T.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
              ${item.price.toFixed(2)}
            </span>
            <span style={{ fontFamily: T.display, fontSize: "14px", fontWeight: 600, color: T.textMuted, letterSpacing: "0.01em" }}>
              prepaid · pickup
            </span>
          </div>

          {/* ── 3. SCARCITY BAR — primary urgency driver ── */}
          <div>
            <div style={{ marginBottom: "9px" }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                fontFamily: T.display, fontSize: "14px", fontWeight: 800, letterSpacing: "0.01em",
                padding: "6px 13px", borderRadius: "9999px",
                background: sold ? "#F3F4F6" : "rgba(249,58,37,0.10)",
                color: sold ? T.textMuted : T.red,
                border: `1px solid ${sold ? T.divider : "rgba(249,58,37,0.28)"}`,
              }}>
                {scarcityText}
              </span>
            </div>
            <div style={{ width: "100%", height: 8, borderRadius: "9999px", background: T.divider, overflow: "hidden" }}>
              <div style={{
                width: `${Math.min(Math.max(fillPct, 0), 100)}%`,
                height: "100%", borderRadius: "9999px",
                background: "linear-gradient(90deg, #F93A25 0%, #D97706 100%)",
                transition: "width 300ms ease",
              }} />
            </div>
          </div>

          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: "10px", textAlign: "center",
              background: "rgba(249,58,37,0.1)", border: "1px solid rgba(249,58,37,0.3)",
              color: T.red, fontSize: "13px", fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          {alreadyClaimedMessage && (
            <div
              data-testid="already-claimed-banner"
              style={{
                background: "#F3F4F6", border: `1px solid ${T.divider}`, borderRadius: "14px",
                padding: "18px 20px", textAlign: "center", color: T.text,
                fontSize: "16px", lineHeight: 1.45, whiteSpace: "pre-line",
                display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: "28px", height: "28px", borderRadius: "9999px",
                  background: "#DCFCE7", color: T.greenFg, fontSize: "16px", fontWeight: 800,
                }}
              >
                ✓
              </span>
              {alreadyClaimedMessage}
            </div>
          )}
        </div>

        {/* ── 4. DARK PICKUP BAND ── */}
        <div style={{ background: T.dark, padding: "24px 22px", color: "#fff" }}>
          <div className="dp-when-where">
            {/* WHEN */}
            <div>
              <div style={bandLabel}>When</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
                {dayDate}
              </div>
              <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)" }}>
                {timeWindow}
              </div>
            </div>

            {/* WHERE */}
            <div>
              <div style={bandLabel}>Where</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
                {item.restaurant_name}
              </div>
              {item.address && (
                <div style={{
                  fontSize: "13px", color: "rgba(255,255,255,0.6)", marginBottom: "12px",
                  wordBreak: "break-word", overflowWrap: "anywhere",
                }}>
                  {item.address}
                </div>
              )}
              {directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block", background: T.red, color: "#fff",
                    padding: "9px 18px", borderRadius: "8px", fontSize: "13px",
                    fontWeight: 700, textDecoration: "none", boxShadow: T.redShadow,
                    marginTop: item.address ? 0 : "4px",
                  }}
                >
                  Get directions →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── 5. ONE-LINE REASSURANCE ── */}
        <div style={{
          padding: "14px 22px", textAlign: "center",
          fontSize: "12.5px", fontWeight: 600, color: T.textMuted,
          borderBottom: `1px solid ${T.divider}`,
        }}>
          Prepaid · We text your QR · Show it at pickup
        </div>

        {/* ── 6a. QUANTITY SELECTOR ── */}
        {!disabled && (
          <div style={{ padding: "18px 22px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", border: `1px solid ${T.divider}`, borderRadius: "14px",
            }}>
              <span style={{ fontSize: "14px", color: T.text, fontWeight: 700 }}>Quantity</span>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                  style={{
                    width: 38, height: 38, borderRadius: 10,
                    border: `1.5px solid ${T.divider}`, background: "#fff",
                    color: quantity <= 1 ? T.textDim : T.text,
                    fontSize: 22, fontWeight: 700,
                    cursor: quantity <= 1 ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: T.display,
                  }}
                >−</button>
                <span style={{
                  fontFamily: T.mono, fontSize: 20, fontWeight: 800, color: T.text,
                  minWidth: 24, textAlign: "center",
                }}>{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  disabled={quantity >= maxQty}
                  aria-label="Increase quantity"
                  style={{
                    width: 38, height: 38, borderRadius: 10,
                    border: `1.5px solid ${T.divider}`, background: "#fff",
                    color: quantity >= maxQty ? T.textDim : T.text,
                    fontSize: 22, fontWeight: 700,
                    cursor: quantity >= maxQty ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: T.display,
                  }}
                >+</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 6b. STICKY CTA — floats aligned to the card's side gutters ── */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(16px + env(safe-area-inset-bottom))",
          left: "50%", transform: "translateX(-50%)",
          width: "calc(100% - 32px)", maxWidth: "480px", zIndex: 100,
        }}
      >
        <button
          onClick={!ctaDisabled && !loading ? handleClaim : undefined}
          disabled={ctaDisabled || loading}
          style={{
            width: "100%", minHeight: 54, border: "none", borderRadius: "14px",
            background: ctaDisabled ? "#E5E7EB" : T.ink,
            color: ctaDisabled ? T.textDim : "#fff",
            fontFamily: T.display, fontWeight: 800, fontSize: "17px",
            cursor: ctaDisabled || loading ? "default" : "pointer",
            transition: "all 150ms ease",
            boxShadow: ctaDisabled ? "none" : "0 8px 24px rgba(0,0,0,0.32)",
          }}
        >
          {ctaText}
        </button>
      </div>
    </div>
  );
}
