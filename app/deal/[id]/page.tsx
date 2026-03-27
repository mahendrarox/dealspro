"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import { DROP_ITEMS, type DropItem, getDropItem, canPurchase, isPickupInProgress, hasEnded, formatTimeWindow, formatDate, getDiscountPct, getSavings } from "@/lib/constants";

const T = {
  red: "#F93A25", red50: "rgba(249,58,37,0.08)", green: "#16A34A",
  n0: "#FFFFFF", n50: "#F7F7F8", n200: "#E4E4E7", n400: "#A1A1AA",
  n500: "#52525B", n900: "#18181B", n950: "#111114",
  display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace",
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [spotsClaimed, setSpotsClaimed] = useState(0);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);

  const item = getDropItem(id);

  // Fetch spots
  useEffect(() => {
    if (!item) return;
    const fetchSpots = async () => {
      try {
        const res = await fetch(`/api/spots?id=${item.id}`);
        const data = await res.json();
        if (data.spots?.[item.id]) {
          setSpotsRemaining(data.spots[item.id].remaining);
          setSpotsClaimed(data.spots[item.id].claimed);
        }
      } catch { /* silent */ }
    };
    fetchSpots();
    const iv = setInterval(fetchSpots, 15000);
    return () => clearInterval(iv);
  }, [item]);

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

  const purchasable = canPurchase(item);
  const pickupActive = isPickupInProgress(item);
  const ended = hasEnded(item);
  const sold = spotsRemaining !== null && spotsRemaining <= 0;
  const disabled = !purchasable || sold || ended || pickupActive || alreadyClaimed;
  const pct = getDiscountPct(item);
  const savings = getSavings(item);

  const handleClaim = async () => {
    setLoading(true);
    setError("");

    const phone = localStorage.getItem("dp_phone") || "";
    if (!phone) {
      setError("Please sign up on the homepage first to get your phone number on file.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, drop_item_id: item.id }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (res.status === 409) {
        setAlreadyClaimed(true);
        setError(data.error || "You already claimed this spot.");
        setLoading(false);
      } else {
        setError(data.error || "Could not start checkout. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  let statusMsg = "";
  if (alreadyClaimed) statusMsg = "You already claimed this spot ✓";
  else if (ended) statusMsg = "This drop has ended";
  else if (pickupActive) statusMsg = "Ordering closed · Pickup in progress";
  else if (sold) statusMsg = "Sold out — all spots claimed";

  return (
    <div style={{
      minHeight: "100vh", background: T.n50, fontFamily: T.display,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
    }}>
      <div style={{
        background: T.n0, borderRadius: "24px", overflow: "hidden",
        width: "100%", maxWidth: "420px", boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
      }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${T.n950}, #1C1C21)`, padding: "32px 28px 24px" }}>
          <div style={{ fontFamily: T.mono, fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em", color: T.red, textTransform: "uppercase", marginBottom: "10px" }}>
            🔥 Limited Drop · {formatDate(item)}
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: T.n0, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: "6px" }}>
            {item.title}
          </div>
          <div style={{ fontSize: "14px", color: T.n400 }}>{item.restaurant_name}</div>
        </div>

        {/* Deal Details */}
        <div style={{ padding: "28px" }}>
          {/* Price */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "24px" }}>
            <span style={{ fontFamily: T.mono, fontSize: "42px", fontWeight: 800, color: T.red, lineHeight: 1 }}>
              ${item.price.toFixed(2)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: "20px", color: T.n400, textDecoration: "line-through" }}>
              ${item.original_price.toFixed(2)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em", color: T.green, background: "rgba(22,163,74,0.1)", padding: "4px 10px", borderRadius: "9999px" }}>
              {pct}% OFF
            </span>
          </div>

          {/* Info rows */}
          <div style={{ background: T.n50, borderRadius: "14px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
            <InfoRow icon="🏪" label="Restaurant" value={item.restaurant_name} />
            <InfoRow icon="📅" label="Date" value={formatDate(item)} />
            <InfoRow icon="⏰" label="Time" value={formatTimeWindow(item)} />
            <InfoRow icon="💰" label="You Save" value={`$${savings.toFixed(2)}`} highlight />
            {spotsRemaining !== null && (
              <InfoRow icon="🎟️" label="Spots Left" value={`${spotsRemaining} of ${item.total_spots}`} highlight={spotsRemaining <= 3} />
            )}
            {spotsClaimed > 0 && (
              <InfoRow icon="🔥" label="Claimed" value={`${spotsClaimed} people`} />
            )}
          </div>

          {/* Status message */}
          {statusMsg && (
            <div style={{
              padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", textAlign: "center",
              background: alreadyClaimed ? "rgba(22,163,74,0.08)" : "rgba(161,161,170,0.1)",
              border: `1px solid ${alreadyClaimed ? "rgba(22,163,74,0.2)" : "rgba(161,161,170,0.2)"}`,
              color: alreadyClaimed ? T.green : T.n400,
              fontFamily: T.display, fontSize: "14px", fontWeight: 600,
            }}>
              {statusMsg}
            </div>
          )}

          {/* Claim Button */}
          <button
            onClick={!disabled && !loading ? handleClaim : undefined}
            disabled={disabled || loading}
            style={{
              width: "100%", padding: "18px", border: "none", borderRadius: "14px",
              background: disabled ? T.n200 : loading ? T.n200 : T.red,
              color: disabled || loading ? T.n400 : T.n0,
              fontFamily: T.display, fontWeight: 700, fontSize: "16px", letterSpacing: "0.01em",
              cursor: disabled || loading ? "default" : "pointer", transition: "all 150ms ease",
              boxShadow: disabled || loading ? "none" : "0 4px 16px rgba(249,58,37,0.35)",
            }}
          >
            {loading ? "Setting up checkout..." : disabled ? (sold ? "Sold Out" : ended ? "Drop Ended" : pickupActive ? "Ordering Closed" : alreadyClaimed ? "Already Claimed" : "Unavailable") : `🔥 Claim Spot for $${item.price.toFixed(2)}`}
          </button>

          {error && !alreadyClaimed && (
            <div style={{
              marginTop: "12px", padding: "12px 16px", borderRadius: "10px",
              background: "rgba(249,58,37,0.08)", border: "1px solid rgba(249,58,37,0.2)",
              color: T.red, fontSize: "13px", textAlign: "center",
            }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: "16px", fontSize: "12px", color: T.n400, textAlign: "center", lineHeight: 1.5 }}>
            Prepay now · Show QR code at pickup · No app required
          </div>
        </div>
      </div>

      <a href="/" style={{ marginTop: "20px", fontSize: "13px", color: T.n400, textDecoration: "none" }}>
        ← Back to DealsPro
      </a>
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "13px", color: "#52525B" }}>{icon} {label}</span>
      <span style={{
        fontSize: "14px", fontWeight: 600,
        color: highlight ? "#F93A25" : "#18181B",
        fontFamily: highlight ? "'JetBrains Mono', monospace" : "inherit",
      }}>
        {value}
      </span>
    </div>
  );
}
