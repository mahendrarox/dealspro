"use client";

import { useState, useEffect, useRef, useMemo } from "react";

const T = {
  color: {
    red500: "#F93A25", red600: "#E0311F",
    green500: "#16A34A", green50: "#DCFCE7",
    n0: "#FFFFFF", n50: "#F7F7F8", n200: "#E4E4E7",
    n400: "#A1A1AA", n500: "#52525B", n800: "#1C1C21",
    n900: "#18181B", n950: "#111114",
  },
  font: { display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

const CONFETTI_COLORS = ["#F93A25", "#FF6B4A", "#FFD700", "#16A34A", "#3B82F6", "#F472B6", "#FFFFFF"];

interface ConfettiData {
  color: string; left: number; delay: number; duration: number;
  endX: number; endY: number; rotation: number; size: number; isCircle: boolean;
}

function generateConfetti(): ConfettiData[] {
  return Array.from({ length: 45 }, (_, i) => ({
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: 10 + Math.random() * 80,
    delay: Math.random() * 0.6,
    duration: 1.8 + Math.random() * 1.2,
    endX: (Math.random() - 0.5) * 300,
    endY: -(200 + Math.random() * 400),
    rotation: Math.random() * 720 - 360,
    size: 6 + Math.random() * 6,
    isCircle: i % 3 === 0,
  }));
}

interface SuccessClientProps {
  order: {
    drop_title: string;
    restaurant_name: string;
    price_paid: number;
    qr_token: string;
  } | null;
  qrDataUrl: string | null;
  savings: string;
  pickupWindow: string;
  dealCardUrl: string | null;
  date?: string | null;
  redemptionValidUntil?: string | null;
}

export default function SuccessClient({ order, qrDataUrl, savings, pickupWindow, dealCardUrl, date, redemptionValidUntil }: SuccessClientProps) {
  const [mounted, setMounted] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [polling, setPolling] = useState(!order);
  const confetti = useMemo(() => mounted ? generateConfetti() : [], [mounted]);
  const [currentOrder, setCurrentOrder] = useState(order);
  const [currentQr, setCurrentQr] = useState(qrDataUrl);
  const [currentUrl, setCurrentUrl] = useState(dealCardUrl);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setShowContent(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Poll for order if webhook hasn't fired yet
  useEffect(() => {
    if (currentOrder || !polling) return;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) { setPolling(false); return; }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/order/poll?session_id=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.order) {
            setCurrentOrder(data.order);
            setCurrentQr(data.qrDataUrl);
            setCurrentUrl(data.dealCardUrl);
            setPolling(false);
          }
        }
      } catch { /* keep polling */ }
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [currentOrder, polling]);

  const handleSave = () => {
    if (!currentQr) return;
    const link = document.createElement("a");
    link.href = currentQr;
    link.download = `dealspro-deal-card.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (!currentUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Check out my DealsPro deal!",
          text: currentOrder ? `I just grabbed ${currentOrder.drop_title} at ${currentOrder.restaurant_name} for $${Number(currentOrder.price_paid).toFixed(2)}!` : "Check out DealsPro!",
          url: currentUrl,
        });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(currentUrl);
      alert("Link copied to clipboard!");
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0F0F0F",
      fontFamily: T.font.display,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      textAlign: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes confetti-burst {
          0% { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(0); }
          10% { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(1.2); }
          100% { opacity: 0; transform: translate(var(--end-x), var(--end-y)) rotate(var(--rotation)) scale(0.5); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(249,58,37,0.2); }
          50% { box-shadow: 0 0 40px rgba(249,58,37,0.4); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Confetti — client-only to avoid hydration mismatch */}
      {mounted && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 10 }}>
          {confetti.map((c, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${c.left}%`,
                bottom: "40%",
                width: `${c.size}px`,
                height: `${c.size}px`,
                background: c.color,
                borderRadius: c.isCircle ? "50%" : "2px",
                opacity: 0,
                animation: `confetti-burst ${c.duration}s ${c.delay}s ease-out forwards`,
                ["--end-x" as string]: `${c.endX}px`,
                ["--end-y" as string]: `${c.endY}px`,
                ["--rotation" as string]: `${c.rotation}deg`,
              }}
            />
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{
        position: "relative",
        zIndex: 5,
        maxWidth: "420px",
        width: "100%",
        opacity: showContent ? 1 : 0,
        transform: showContent ? "translateY(0) scale(1)" : "translateY(30px) scale(0.95)",
        transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        {/* Top label */}
        <div style={{
          fontFamily: T.font.mono,
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.15em",
          color: T.color.red500,
          textTransform: "uppercase",
          marginBottom: "12px",
        }}>
          DealsPro
        </div>

        {/* Main heading */}
        <h1 style={{
          fontSize: "36px",
          fontWeight: 800,
          color: T.color.n0,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          marginBottom: "16px",
        }}>
          Deal Card<br />
          <span style={{ color: T.color.red500 }}>Secured!</span>
        </h1>

        {/* Savings badge */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "rgba(22, 163, 74, 0.15)",
          border: "1px solid rgba(22, 163, 74, 0.3)",
          borderRadius: "9999px",
          padding: "8px 20px",
          marginBottom: "32px",
        }}>
          <span style={{ fontSize: "18px" }}>🎉</span>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: "14px",
            fontWeight: 700,
            color: T.color.green500,
            letterSpacing: "0.02em",
          }}>
            You saved {savings}!
          </span>
        </div>

        {/* Deal card */}
        <div style={{
          background: "linear-gradient(145deg, #1A1A1F, #141417)",
          borderRadius: "20px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          animation: showContent ? "pulse-glow 3s ease-in-out infinite 1s" : "none",
        }}>
          {/* Card header */}
          <div style={{
            padding: "24px 24px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{
              fontFamily: T.font.mono,
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: T.color.red500,
              textTransform: "uppercase",
              marginBottom: "8px",
            }}>
              Your Deal Card
            </div>
            <div style={{
              fontSize: "20px",
              fontWeight: 700,
              color: T.color.n0,
              letterSpacing: "-0.02em",
            }}>
              {currentOrder?.drop_title ?? "Loading..."}
            </div>
            <div style={{ fontSize: "14px", color: T.color.n400, marginTop: "4px" }}>
              {currentOrder?.restaurant_name ?? ""}
            </div>
          </div>

          {/* QR Code section */}
          <div style={{
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            {currentQr ? (
              <div style={{
                padding: "14px",
                background: T.color.n0,
                borderRadius: "14px",
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentQr}
                  alt="Deal Card QR Code"
                  width={200}
                  height={200}
                  style={{ display: "block" }}
                />
              </div>
            ) : (
              <div style={{
                width: "228px",
                height: "228px",
                borderRadius: "14px",
                background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }} />
            )}
          </div>

          {/* Details */}
          <div style={{
            padding: "0 24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: T.color.n400 }}>Restaurant</span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: T.color.n0 }}>
                {currentOrder?.restaurant_name ?? "—"}
              </span>
            </div>
            {date && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: T.color.n400 }}>Date</span>
                <span style={{ fontSize: "14px", fontWeight: 600, color: T.color.n0 }}>{date}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: T.color.n400 }}>Pickup</span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: T.color.n0 }}>
                {pickupWindow}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: T.color.n400 }}>You Paid</span>
              <span style={{
                fontSize: "14px",
                fontWeight: 700,
                fontFamily: T.font.mono,
                color: T.color.red500,
              }}>
                ${currentOrder ? Number(currentOrder.price_paid).toFixed(2) : "—"}
              </span>
            </div>
          </div>

          {/* Validity */}
          {redemptionValidUntil && (
            <div style={{
              padding: "12px 24px 16px",
              textAlign: "center",
              fontSize: "12px",
              color: T.color.n400,
              fontFamily: T.font.mono,
              letterSpacing: "0.03em",
            }}>
              Valid until {new Date(redemptionValidUntil).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at 11:59 PM
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{
          display: "flex",
          gap: "12px",
          marginTop: "24px",
        }}>
          <button
            onClick={handleSave}
            disabled={!currentQr}
            style={{
              flex: 1,
              padding: "14px 20px",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: T.color.n0,
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: T.font.display,
              cursor: currentQr ? "pointer" : "default",
              opacity: currentQr ? 1 : 0.4,
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Save QR
          </button>
          <button
            onClick={handleShare}
            disabled={!currentUrl}
            style={{
              flex: 1,
              padding: "14px 20px",
              borderRadius: "14px",
              border: "none",
              background: T.color.red500,
              color: T.color.n0,
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: T.font.display,
              cursor: currentUrl ? "pointer" : "default",
              opacity: currentUrl ? 1 : 0.4,
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </button>
        </div>

        {/* Footer link */}
        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: "24px",
            fontSize: "14px",
            color: T.color.n400,
            textDecoration: "none",
            fontWeight: 500,
            transition: "color 0.2s ease",
          }}
        >
          ← Browse More Deals
        </a>

        {/* Loading state overlay text */}
        {polling && (
          <div style={{
            marginTop: "16px",
            fontFamily: T.font.mono,
            fontSize: "12px",
            color: T.color.n400,
            letterSpacing: "0.05em",
          }}>
            Confirming your deal card...
          </div>
        )}
      </div>
    </div>
  );
}
