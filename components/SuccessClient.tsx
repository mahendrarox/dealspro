"use client";

import { useEffect, useRef, useState } from "react";
import TicketCard, { type TicketCardProps } from "./TicketCard";

export type SuccessInitialData = TicketCardProps;

const F = {
  display: "'DM Sans', -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

export default function SuccessClient({ initial }: { initial: SuccessInitialData | null }) {
  const [data, setData] = useState<SuccessInitialData | null>(initial);
  const [polling, setPolling] = useState<boolean>(!initial);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (data) return;
    if (!polling) return;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) {
      setPolling(false);
      return;
    }

    pollRef.current = setInterval(async () => {
      pollCount.current += 1;
      try {
        const res = await fetch(
          `/api/order/poll?session_id=${encodeURIComponent(sessionId)}`,
        );
        if (!res.ok) return;
        const payload = await res.json();
        if (payload?.card) {
          setData(payload.card as SuccessInitialData);
          setPolling(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (err) {
        console.error("[SuccessClient] poll error:", err);
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [data, polling]);

  if (data) {
    return <TicketCard {...data} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F3F4F6",
        fontFamily: F.display,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <style>{`
        @keyframes tc-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#FFFFFF",
          borderRadius: "20px",
          padding: "40px 28px",
          textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
        }}
      >
        <div
          style={{
            width: "160px",
            height: "160px",
            margin: "0 auto",
            borderRadius: "14px",
            background:
              "linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)",
            backgroundSize: "200% 100%",
            animation: "tc-shimmer 1.5s infinite",
          }}
        />
        <div
          style={{
            marginTop: "20px",
            fontSize: "16px",
            fontWeight: 700,
            color: "#111827",
          }}
        >
          Confirming your deal…
        </div>
        <div
          style={{
            marginTop: "6px",
            fontFamily: F.mono,
            fontSize: "12px",
            color: "#9CA3AF",
            letterSpacing: "0.05em",
          }}
        >
          This usually takes a few seconds.
        </div>
      </div>
    </div>
  );
}
