"use client";

import { useState } from "react";

type Order = {
  id: string;
  drop_title: string;
  restaurant_name: string;
  price_paid: number;
  status: string;
  qr_token: string;
  created_at: string;
  redeemed_at?: string;
};

export default function ScanPage() {
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemed, setRedeemed] = useState(false);

  const lookUp = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    setOrder(null);
    setRedeemed(false);
    setRedeemError("");

    try {
      const res = await fetch(`/api/order?token=${encodeURIComponent(token.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Order not found");
      } else {
        setOrder(data.order);
        if (data.order.status === "redeemed") setRedeemed(true);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const confirmRedeem = async () => {
    if (!order) return;
    setRedeeming(true);
    setRedeemError("");

    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: order.qr_token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRedeemError(data.error || "Redemption failed");
      } else {
        setOrder(data.order);
        setRedeemed(true);
        console.log("[Scan] Redemption confirmed for token:", order.qr_token);
      }
    } catch {
      setRedeemError("Network error. Please try again.");
    }
    setRedeeming(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111114",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "40px 16px",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: "#F93A25",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          DealsPro · Staff Portal
        </div>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
          }}
        >
          Redeem a Ticket
        </h1>
        <p style={{ fontSize: "14px", color: "#52525B", marginTop: "6px" }}>
          Enter the token from the customer&apos;s QR code
        </p>
      </div>

      {/* Token Input Card */}
      <div
        style={{
          background: "#1C1C21",
          borderRadius: "20px",
          padding: "28px",
          width: "100%",
          maxWidth: "460px",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: "20px",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: 600,
            color: "#52525B",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "8px",
          }}
        >
          QR Token
        </label>
        <input
          type="text"
          placeholder="e.g. a1b2c3d4-e5f6-..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") lookUp(); }}
          style={{
            width: "100%",
            padding: "14px 16px",
            background: "#111114",
            border: "2px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            color: "#FFFFFF",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            outline: "none",
            boxSizing: "border-box",
            marginBottom: "12px",
          }}
        />
        <button
          onClick={lookUp}
          disabled={loading || !token.trim()}
          style={{
            width: "100%",
            padding: "14px",
            background: token.trim() ? "#F93A25" : "#1C1C21",
            border: token.trim() ? "none" : "2px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            color: token.trim() ? "#FFFFFF" : "#52525B",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: "15px",
            cursor: token.trim() ? "pointer" : "default",
            transition: "all 200ms ease",
          }}
        >
          {loading ? "Looking up..." : "Look Up Order"}
        </button>

        {error && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px 16px",
              background: "rgba(249,58,37,0.1)",
              border: "1px solid rgba(249,58,37,0.2)",
              borderRadius: "10px",
              color: "#F93A25",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Order Details */}
      {order && (
        <div
          style={{
            background: "#1C1C21",
            borderRadius: "20px",
            overflow: "hidden",
            width: "100%",
            maxWidth: "460px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Order Header */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#FFFFFF" }}>
                {order.drop_title}
              </div>
              <div style={{ fontSize: "13px", color: "#52525B", marginTop: "2px" }}>
                {order.restaurant_name}
              </div>
            </div>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "5px 12px",
                borderRadius: "9999px",
                background: redeemed ? "rgba(161,161,170,0.15)" : "rgba(22,163,74,0.15)",
                color: redeemed ? "#A1A1AA" : "#16A34A",
              }}
            >
              {redeemed ? "Redeemed" : "Paid"}
            </span>
          </div>

          {/* Order Info */}
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <ScanDetailRow label="Amount Paid" value={`$${Number(order.price_paid).toFixed(2)}`} />
            <ScanDetailRow label="Pickup Window" value="6–8 PM" />
            <ScanDetailRow
              label="Order ID"
              value={order.id.slice(0, 8) + "..."}
              mono
            />
            {redeemed && order.redeemed_at && (
              <ScanDetailRow
                label="Redeemed At"
                value={new Date(order.redeemed_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              />
            )}
          </div>

          {/* Redeem Button */}
          <div style={{ padding: "0 24px 24px" }}>
            {redeemed ? (
              <div
                style={{
                  width: "100%",
                  padding: "16px",
                  background: "rgba(22,163,74,0.1)",
                  border: "1px solid rgba(22,163,74,0.2)",
                  borderRadius: "12px",
                  color: "#16A34A",
                  fontWeight: 700,
                  fontSize: "15px",
                  textAlign: "center",
                  boxSizing: "border-box",
                }}
              >
                ✓ Ticket Successfully Redeemed
              </div>
            ) : (
              <button
                onClick={confirmRedeem}
                disabled={redeeming}
                style={{
                  width: "100%",
                  padding: "16px",
                  background: "#16A34A",
                  border: "none",
                  borderRadius: "12px",
                  color: "#FFFFFF",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: "15px",
                  cursor: redeeming ? "default" : "pointer",
                  opacity: redeeming ? 0.6 : 1,
                  transition: "opacity 150ms ease",
                  boxSizing: "border-box",
                }}
              >
                {redeeming ? "Confirming..." : "Confirm Redeem"}
              </button>
            )}

            {redeemError && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "10px 14px",
                  background: "rgba(249,58,37,0.1)",
                  border: "1px solid rgba(249,58,37,0.2)",
                  borderRadius: "10px",
                  color: "#F93A25",
                  fontSize: "13px",
                }}
              >
                {redeemError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScanDetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "13px", color: "#52525B" }}>{label}</span>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#FFFFFF",
          fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}
