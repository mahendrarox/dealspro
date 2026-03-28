"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DROP_ITEMS, type DropItem, getDropItem, canPurchase, isPickupInProgress, hasEnded, formatTimeWindow, formatDate, getDiscountPct, getSavings } from "@/lib/constants";
import PhoneInput, { isPhoneValid, toE164 } from "@/components/PhoneInput";

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
  const searchParams = useSearchParams();
  const initialQty = Math.min(4, Math.max(1, parseInt(searchParams.get("qty") || "1") || 1));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [spotsRemaining, setSpotsRemaining] = useState<number | null>(null);
  const [spotsClaimed, setSpotsClaimed] = useState(0);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [quantity, setQuantity] = useState(initialQty);
  const [showConfirm, setShowConfirm] = useState(false);

  // Phone capture state
  const [phone, setPhone] = useState<string | null>(null); // null = not yet checked, "" = no phone, "+1..." = has phone
  const [phoneInputVal, setPhoneInputVal] = useState(""); // formatted display value
  const [phoneError, setPhoneError] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Check localStorage for existing phone on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("dp_phone");
      setPhone(stored || "");
    } catch {
      setPhone("");
    }
  }, []);

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

  // Clamp quantity when spots change
  useEffect(() => {
    if (spotsRemaining !== null && quantity > spotsRemaining) {
      setQuantity(Math.max(1, Math.min(spotsRemaining, 4)));
    }
  }, [spotsRemaining, quantity]);

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
  const cancelled = item.status === "cancelled";
  const disabled = !purchasable || sold || ended || pickupActive || alreadyClaimed || cancelled;
  const pct = getDiscountPct(item);
  const savings = getSavings(item);
  const maxQty = Math.min(4, spotsRemaining ?? 4);
  const total = (item.price * quantity).toFixed(2);

  const handlePhoneSubmit = async () => {
    setPhoneError("");
    if (!isPhoneValid(phoneInputVal)) {
      setPhoneError("Enter a valid 10-digit US phone number");
      return;
    }
    const normalized = toE164(phoneInputVal);
    setPhoneSaving(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPhoneError(data.error || "Could not save phone. Try again.");
        setPhoneSaving(false);
        return;
      }
      try { localStorage.setItem("dp_phone", normalized); } catch {}
      setPhone(normalized);
    } catch {
      setPhoneError("Network error. Try again.");
    }
    setPhoneSaving(false);
  };

  const handleClaim = async () => {
    setLoading(true);
    setError("");
    setShowConfirm(false);

    if (!phone) {
      setError("Enter your phone number above to claim this deal.");
      setLoading(false);
      return;
    }

    // Re-fetch spots before checkout
    try {
      const spotsRes = await fetch(`/api/spots?id=${item.id}`);
      const spotsData = await spotsRes.json();
      const latestRemaining = spotsData.spots?.[item.id]?.remaining ?? 0;
      if (quantity > latestRemaining) {
        setError(`Only ${latestRemaining} spot${latestRemaining !== 1 ? "s" : ""} left — please reduce quantity.`);
        setSpotsRemaining(latestRemaining);
        setLoading(false);
        return;
      }
    } catch { /* proceed anyway */ }

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, drop_item_id: item.id, quantity }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        setShowConfirm(true);
        setTimeout(() => { window.location.href = data.checkoutUrl; }, 800);
      } else if (res.status === 409) {
        setAlreadyClaimed(true);
        setError(data.error || "You already claimed this drop.");
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
  if (cancelled) statusMsg = "This drop has been cancelled. Refunds are being processed.";
  else if (alreadyClaimed) statusMsg = "You already claimed this drop ✓";
  else if (ended) statusMsg = "This drop has ended";
  else if (pickupActive) statusMsg = "Ordering closed · Pickup in progress";
  else if (sold) statusMsg = "Sold out — all spots claimed";

  return (
    <div style={{
      minHeight: "100vh", background: T.n50, fontFamily: T.display,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
    }}>
      {/* Redirect overlay */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: T.n0, borderRadius: "20px", padding: "40px 32px", textAlign: "center", maxWidth: "340px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: T.n900, marginBottom: "6px" }}>
              Redirecting to secure checkout...
            </div>
            <div style={{ fontSize: "14px", color: T.n500 }}>
              {quantity}x {item.title} · ${total}
            </div>
          </div>
        </div>
      )}

      <div style={{
        background: T.n0, borderRadius: "24px", overflow: "hidden",
        width: "100%", maxWidth: "420px", boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
      }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${T.n950}, #1C1C21)`, padding: "32px 28px 24px" }}>
          <div style={{ fontFamily: T.mono, fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em", color: T.red, textTransform: "uppercase", marginBottom: "10px" }}>
            {cancelled ? "⚠️ Cancelled" : `🔥 Limited Drop · ${formatDate(item)}`}
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
            <InfoRow icon="💰" label="You Save" value={`$${(savings * quantity).toFixed(2)}`} highlight />
            {spotsRemaining !== null && (
              <InfoRow icon="🎟️" label="Spots Left" value={`${spotsRemaining} of ${item.total_spots}`} highlight={spotsRemaining <= 3} />
            )}
            {spotsClaimed > 0 && (
              <InfoRow icon="🔥" label="Claimed" value={`${spotsClaimed} spots`} />
            )}
          </div>

          {/* Phone capture — show when no phone stored */}
          {phone === "" && purchasable && !sold && !cancelled && (
            <div style={{
              marginBottom: "16px", padding: "20px", background: T.n50,
              borderRadius: "14px", border: `1px solid ${T.n200}`,
            }}>
              <PhoneInput
                value={phoneInputVal}
                onChange={(v) => { setPhoneInputVal(v); setPhoneError(""); }}
                onSubmit={handlePhoneSubmit}
                label="Enter your phone to claim this deal"
                showButton
                buttonText="Continue"
                buttonLoading={phoneSaving}
                error={phoneError}
                inputBg={T.n0}
              />
            </div>
          )}

          {/* Quantity Selector — show whenever spots available and purchasable */}
          {purchasable && !sold && !cancelled && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "16px",
              marginBottom: "20px", padding: "14px", background: T.n50, borderRadius: "14px",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: T.n500 }}>Qty</span>
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                style={{
                  width: "40px", height: "40px", borderRadius: "10px",
                  border: `1.5px solid ${quantity <= 1 ? T.n200 : T.n400}`,
                  background: T.n0, color: quantity <= 1 ? T.n200 : T.n900,
                  fontSize: "20px", fontWeight: 700, cursor: quantity <= 1 ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 150ms ease",
                }}
              >
                −
              </button>
              <span style={{
                fontFamily: T.mono, fontSize: "24px", fontWeight: 800,
                color: T.n900, minWidth: "32px", textAlign: "center",
              }}>
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(q => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                style={{
                  width: "40px", height: "40px", borderRadius: "10px",
                  border: `1.5px solid ${quantity >= maxQty ? T.n200 : T.n400}`,
                  background: T.n0, color: quantity >= maxQty ? T.n200 : T.n900,
                  fontSize: "20px", fontWeight: 700, cursor: quantity >= maxQty ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 150ms ease",
                }}
              >
                +
              </button>
              {quantity > 1 && (
                <span style={{ fontSize: "14px", fontWeight: 600, color: T.n500, fontFamily: T.mono }}>
                  ${total}
                </span>
              )}
            </div>
          )}

          {/* Status message */}
          {statusMsg && (
            <div style={{
              padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", textAlign: "center",
              background: cancelled ? "rgba(249,58,37,0.08)" : alreadyClaimed ? "rgba(22,163,74,0.08)" : "rgba(161,161,170,0.1)",
              border: `1px solid ${cancelled ? "rgba(249,58,37,0.2)" : alreadyClaimed ? "rgba(22,163,74,0.2)" : "rgba(161,161,170,0.2)"}`,
              color: cancelled ? T.red : alreadyClaimed ? T.green : T.n400,
              fontFamily: T.display, fontSize: "14px", fontWeight: 600,
            }}>
              {statusMsg}
            </div>
          )}

          {/* Claim Button */}
          {(() => {
            const noPhone = phone === "";
            const btnDisabled = disabled || loading || noPhone;
            return (
              <button
                onClick={!btnDisabled ? handleClaim : undefined}
                disabled={btnDisabled}
                style={{
                  width: "100%", padding: "18px", border: "none", borderRadius: "14px",
                  background: btnDisabled ? T.n200 : T.red,
                  color: btnDisabled ? T.n400 : T.n0,
                  fontFamily: T.display, fontWeight: 700, fontSize: "16px", letterSpacing: "0.01em",
                  cursor: btnDisabled ? "default" : "pointer", transition: "all 150ms ease",
                  boxShadow: btnDisabled ? "none" : "0 4px 16px rgba(249,58,37,0.35)",
                }}
              >
                {loading
                  ? "Setting up checkout..."
                  : disabled
                    ? (cancelled ? "Cancelled" : sold ? "Sold Out" : ended ? "Drop Ended" : pickupActive ? "Ordering Closed" : alreadyClaimed ? "Already Claimed" : "Unavailable")
                    : noPhone
                      ? "Enter phone number above ↑"
                      : `🔥 Claim ${quantity} Spot${quantity > 1 ? "s" : ""} for $${total}`}
              </button>
            );
          })()}

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
