"use client";

import { useState, useEffect, useRef } from "react";

const F = { display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" };

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
  const [showContent, setShowContent] = useState(false);
  const [polling, setPolling] = useState(!order);
  const [currentOrder, setCurrentOrder] = useState(order);
  const [currentQr, setCurrentQr] = useState(qrDataUrl);
  const [currentUrl, setCurrentUrl] = useState(dealCardUrl);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(t);
  }, []);

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
    link.download = "dealspro-deal-card.png";
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

  const validDate = redemptionValidUntil
    ? new Date(redemptionValidUntil).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0F0F0F",
      fontFamily: F.display,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
      `}</style>

      <div style={{
        maxWidth: "400px",
        width: "100%",
        opacity: showContent ? 1 : 0,
        transform: showContent ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.5s ease",
      }}>
        {/* White card */}
        <div style={{
          background: "#FFFFFF",
          borderRadius: "20px",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        }}>
          {/* Header */}
          <div style={{ padding: "32px 28px 24px", textAlign: "center" }}>
            <div style={{
              fontFamily: F.mono,
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: "#F93A25",
              textTransform: "uppercase",
              marginBottom: "16px",
            }}>
              DealsPro
            </div>
            <h1 style={{
              fontSize: "28px",
              fontWeight: 800,
              color: "#18181B",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              marginBottom: "6px",
            }}>
              Deal Card Secured!
            </h1>
            <div style={{ fontSize: "14px", color: "#16A34A", fontWeight: 500, marginTop: "8px" }}>
              You saved {savings}
            </div>
          </div>

          {/* Deal info */}
          <div style={{ padding: "0 28px 20px" }}>
            <div style={{
              background: "#F7F7F8",
              borderRadius: "12px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#18181B" }}>
                {currentOrder?.drop_title ?? "Loading..."}
              </div>
              <div style={{ fontSize: "14px", color: "#52525B" }}>
                {currentOrder?.restaurant_name ?? ""}
              </div>
              {date && (
                <div style={{ fontSize: "13px", color: "#52525B" }}>
                  {date} · {pickupWindow}
                </div>
              )}
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#18181B", fontFamily: F.mono }}>
                ${currentOrder ? Number(currentOrder.price_paid).toFixed(2) : "—"} paid
              </div>
            </div>
          </div>

          {/* QR Code */}
          <div style={{ padding: "0 28px 24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {currentQr ? (
              <div style={{
                padding: "16px",
                background: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid #E4E4E7",
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={currentQr} alt="Deal Card QR Code" width={200} height={200} style={{ display: "block" }} />
              </div>
            ) : (
              <div style={{
                width: "232px", height: "232px", borderRadius: "12px",
                background: "linear-gradient(90deg, #F7F7F8 25%, #E4E4E7 50%, #F7F7F8 75%)",
                backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite",
              }} />
            )}
            <div style={{ marginTop: "12px", fontSize: "13px", color: "#52525B", textAlign: "center" }}>
              Show this to staff at {currentOrder?.restaurant_name ?? "the restaurant"}
            </div>
            {validDate && (
              <div style={{ marginTop: "4px", fontSize: "12px", color: "#A1A1AA", textAlign: "center" }}>
                Valid until {validDate} at 11:59 PM
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ padding: "0 28px 28px", display: "flex", gap: "10px" }}>
            <button onClick={handleSave} disabled={!currentQr} style={{
              flex: 1, padding: "12px 16px", borderRadius: "10px",
              border: "1px solid #E4E4E7", background: "#FFFFFF",
              color: "#18181B", fontSize: "14px", fontWeight: 600,
              fontFamily: F.display, cursor: currentQr ? "pointer" : "default",
              opacity: currentQr ? 1 : 0.4, display: "flex",
              alignItems: "center", justifyContent: "center", gap: "6px",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Save
            </button>
            <button onClick={handleShare} disabled={!currentUrl} style={{
              flex: 1, padding: "12px 16px", borderRadius: "10px",
              border: "1px solid #E4E4E7", background: "#FFFFFF",
              color: "#18181B", fontSize: "14px", fontWeight: 600,
              fontFamily: F.display, cursor: currentUrl ? "pointer" : "default",
              opacity: currentUrl ? 1 : 0.4, display: "flex",
              alignItems: "center", justifyContent: "center", gap: "6px",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <a href="/" style={{ fontSize: "14px", color: "#A1A1AA", textDecoration: "none", fontWeight: 500 }}>
            ← Browse More Deals
          </a>
        </div>

        {polling && (
          <div style={{ textAlign: "center", marginTop: "16px", fontFamily: F.mono, fontSize: "12px", color: "#A1A1AA", letterSpacing: "0.05em" }}>
            Confirming your deal card...
          </div>
        )}
      </div>
    </div>
  );
}
