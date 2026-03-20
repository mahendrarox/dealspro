"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { HARDCODED_DROP } from "@/lib/constants";

const T = {
  red: "#F93A25",
  red50: "rgba(249,58,37,0.08)",
  green: "#16A34A",
  n0: "#FFFFFF",
  n50: "#F7F7F8",
  n200: "#E4E4E7",
  n400: "#A1A1AA",
  n500: "#52525B",
  n900: "#18181B",
  n950: "#111114",
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
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Validate this is the known drop
  const drop = HARDCODED_DROP;

  const handleClaim = async () => {
    setLoading(true);
    setError("");
    console.log("[Deal] Claim button clicked, uid:", uid);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError("Could not start checkout. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const originalPrice = ((drop.price_cents / 100) / 0.5).toFixed(2);
  const dealPrice = (drop.price_cents / 100).toFixed(2);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.n50,
        fontFamily: T.display,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          background: T.n0,
          borderRadius: "24px",
          overflow: "hidden",
          width: "100%",
          maxWidth: "420px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.10)",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: `linear-gradient(135deg, ${T.n950}, #1C1C21)`,
            padding: "32px 28px 24px",
          }}
        >
          <div
            style={{
              fontFamily: T.mono,
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: T.red,
              textTransform: "uppercase",
              marginBottom: "10px",
            }}
          >
            🔥 Limited Drop · This Week Only
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: 800,
              color: T.n0,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
              marginBottom: "6px",
            }}
          >
            {drop.title}
          </div>
          <div style={{ fontSize: "14px", color: T.n400 }}>{drop.restaurant_name}</div>
        </div>

        {/* Deal Details */}
        <div style={{ padding: "28px" }}>
          {/* Price */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
              marginBottom: "24px",
            }}
          >
            <span
              style={{
                fontFamily: T.mono,
                fontSize: "42px",
                fontWeight: 800,
                color: T.red,
                lineHeight: 1,
              }}
            >
              ${dealPrice}
            </span>
            <span
              style={{
                fontFamily: T.mono,
                fontSize: "20px",
                color: T.n400,
                textDecoration: "line-through",
              }}
            >
              ${originalPrice}
            </span>
            <span
              style={{
                fontFamily: T.mono,
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: T.green,
                background: "rgba(22,163,74,0.1)",
                padding: "4px 10px",
                borderRadius: "9999px",
              }}
            >
              50% OFF
            </span>
          </div>

          {/* Info rows */}
          <div
            style={{
              background: T.n50,
              borderRadius: "14px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <InfoRow icon="🏪" label="Restaurant" value={drop.restaurant_name} />
            <InfoRow icon="🍛" label="Deal" value="Biryani Drop" />
            <InfoRow icon="🕕" label="Pickup Window" value={drop.pickup_window} />
            <InfoRow icon="💳" label="You Pay" value={`$${dealPrice}`} highlight />
          </div>

          {/* Claim Button */}
          <button
            onClick={handleClaim}
            disabled={loading}
            style={{
              width: "100%",
              padding: "18px",
              background: loading ? T.n200 : T.red,
              border: "none",
              borderRadius: "14px",
              color: loading ? T.n400 : T.n0,
              fontFamily: T.display,
              fontWeight: 700,
              fontSize: "16px",
              letterSpacing: "0.01em",
              cursor: loading ? "default" : "pointer",
              transition: "all 150ms ease",
              boxShadow: loading ? "none" : "0 4px 16px rgba(249,58,37,0.35)",
            }}
          >
            {loading ? "Setting up checkout..." : "🔥 Claim This Deal"}
          </button>

          {error && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px 16px",
                background: "rgba(249,58,37,0.08)",
                border: "1px solid rgba(249,58,37,0.2)",
                borderRadius: "10px",
                color: T.red,
                fontSize: "13px",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              marginTop: "16px",
              fontSize: "12px",
              color: T.n400,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Prepay now · Show QR code at pickup · No app required
          </div>
        </div>
      </div>

      <a
        href="/"
        style={{
          marginTop: "20px",
          fontSize: "13px",
          color: T.n400,
          textDecoration: "none",
        }}
      >
        ← Back to DealsPro
      </a>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "13px", color: "#52525B" }}>
        {icon} {label}
      </span>
      <span
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: highlight ? "#F93A25" : "#18181B",
          fontFamily: highlight ? "'JetBrains Mono', monospace" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}
