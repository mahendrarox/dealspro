"use client";

import { useEffect, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────

export type TicketStatus = "active" | "redeemed" | "expired";

export interface TicketDrop {
  title: string;
  restaurantName: string;
  price: number;
  originalPrice: number | null;
  date: string;        // "YYYY-MM-DD"
  startTime: string;   // "HH:MM" 24h
  endTime: string;     // "HH:MM" 24h
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface TicketCardProps {
  orderId: string;              // orders.id
  qrToken: string;              // orders.qr_token
  phone: string | null;         // orders.phone
  quantity: number;
  pricePaid: number;            // orders.price_paid (total)
  status: TicketStatus;
  redeemedAt: string | null;    // ISO
  qrDataUrl: string;
  drop: TicketDrop | null;
}

// ─── Constants ───────────────────────────────────────────────────────

const F = {
  display: "'DM Sans', -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

const C = {
  page: "#F3F4F6",
  white: "#FFFFFF",
  dark: "#1F2937",
  red: "#F93A25",
  redShadow: "0 4px 14px rgba(249, 58, 37, 0.35)",
  text: "#111827",
  textMuted: "#6B7280",
  textDim: "#9CA3AF",
  green: "#16A34A",
  greenBg: "#ECFDF5",
  greenFg: "#059669",
  redeemed: "#EF4444",
  divider: "#E5E7EB",
};

// ─── Formatting helpers ──────────────────────────────────────────────

function formatIdChunk(raw: string): string {
  const clean = raw.replace(/-/g, "").toUpperCase().slice(0, 8).padEnd(8, "X");
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

function maskPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  let ten: string;
  if (digits.length === 11 && digits[0] === "1") ten = digits.slice(1);
  else if (digits.length === 10) ten = digits;
  else return null;
  return `+1 ${ten.slice(0, 3)} *** ${ten.slice(6, 10)}`;
}

function formatTimeWindow(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h] = t.split(":").map(Number);
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? "PM" : "AM";
    return { hour12, ampm };
  };
  const s = fmt(start);
  const e = fmt(end);
  return s.ampm === e.ampm
    ? `${s.hour12}–${e.hour12} ${e.ampm}`
    : `${s.hour12} ${s.ampm}–${e.hour12} ${e.ampm}`;
}

function formatDayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatRedeemedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildDirectionsUrl(drop: TicketDrop): string | null {
  if (drop.lat !== null && drop.lng !== null && drop.lat !== 0 && drop.lng !== 0) {
    return `https://www.google.com/maps/dir/?api=1&destination=${drop.lat},${drop.lng}`;
  }
  if (drop.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(drop.address)}`;
  }
  return null;
}

function toTimestamp(dateStr: string, timeStr: string): number {
  return new Date(`${dateStr}T${timeStr}:00`).getTime();
}

// ─── Countdown hook ──────────────────────────────────────────────────

interface CountdownState {
  label: string;
  value: string;
  color: string;
}

function useCountdown(drop: TicketDrop | null, status: TicketStatus): CountdownState | null {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!drop || status !== "active") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [drop, status]);

  if (!drop || status !== "active") return null;

  const start = toTimestamp(drop.date, drop.startTime);
  const end = toTimestamp(drop.date, drop.endTime);

  if (now >= end) return null;

  const target = now < start ? start : end;
  const label = now < start ? "Starts in" : "Pickup ends in";
  const color = now < start ? "#FDE68A" : "#86EFAC";

  const total = Math.max(0, target - now);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const value = `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return { label, value, color };
}

// ─── Component ───────────────────────────────────────────────────────

export default function TicketCard(props: TicketCardProps) {
  const { orderId, qrToken, phone, quantity, pricePaid, status, redeemedAt, qrDataUrl, drop } = props;
  const countdown = useCountdown(drop, status);

  const orderIdDisplay = formatIdChunk(orderId);
  const tokenDisplay = formatIdChunk(qrToken);
  const maskedPhone = maskPhone(phone);

  const originalTotal =
    drop && drop.originalPrice !== null && drop.originalPrice > 0
      ? drop.originalPrice * quantity
      : null;
  const savings = originalTotal !== null ? Math.max(0, originalTotal - pricePaid) : 0;
  const showSavings = originalTotal !== null && savings > 0;

  const statusLabel =
    status === "active" ? "✓ Active" : status === "redeemed" ? "Redeemed" : "Expired";
  const statusColor =
    status === "active" ? C.white : status === "redeemed" ? C.redeemed : C.textDim;
  const statusBg =
    status === "active" ? C.green : status === "redeemed" ? "#FEE2E2" : "#F3F4F6";
  const statusPadding = status === "active" ? "6px 18px" : "5px 10px";

  const directionsUrl = drop ? buildDirectionsUrl(drop) : null;

  const footerText =
    status === "active"
      ? "Present this QR code to the staff when you arrive."
      : status === "redeemed"
        ? redeemedAt
          ? `This deal was redeemed on ${formatRedeemedAt(redeemedAt)}.`
          : "This deal has already been redeemed."
        : "This deal has expired.";

  const timeWindow = drop ? formatTimeWindow(drop.startTime, drop.endTime) : "";
  const dayDate = drop ? formatDayDate(drop.date) : "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.page,
        fontFamily: F.display,
        padding: "16px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <style>{`
        .tc-wrap { width: 100%; max-width: 420px; }
        .tc-hero-inner {
          display: flex; flex-direction: column; gap: 20px;
          align-items: stretch;
        }
        .tc-when-where { display: flex; flex-direction: column; gap: 20px; }
        .tc-qr-wrap { align-self: center; }
        @media (min-width: 640px) {
          .tc-hero-inner {
            flex-direction: row; justify-content: space-between; align-items: flex-start;
          }
          .tc-when-where { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .tc-qr-wrap { align-self: auto; }
        }
      `}</style>

      <div className="tc-wrap">
        <div
          style={{
            background: C.white,
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
          }}
        >
          {/* ── Section 1: Top Bar ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              background: C.white,
              borderBottom: `1px solid ${C.divider}`,
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="DealsPro"
                style={{
                  height: "36px",
                  width: "auto",
                  maxWidth: "160px",
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: F.display,
                  fontSize: "22px",
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                  lineHeight: 1,
                }}
              >
                <span style={{ color: "#1A1A1A" }}>Deals</span>
                <span style={{ color: C.red }}>Pro</span>
              </span>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 12px",
                border: `1px solid ${C.divider}`,
                borderRadius: "9999px",
                background: C.white,
                fontSize: "11px",
                color: C.textMuted,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: F.mono, fontWeight: 600, color: C.text }}>
                #{orderIdDisplay}
              </span>
              {maskedPhone && (
                <>
                  <span style={{ width: "1px", height: "12px", background: C.divider }} />
                  <span style={{ fontFamily: F.display, fontWeight: 500 }}>{maskedPhone}</span>
                </>
              )}
            </div>
          </div>

          {/* ── Section 2: Red Hero ── */}
          <div
            style={{
              background: "linear-gradient(145deg, #F93A25 0%, #E8301A 50%, #D42A16 100%)",
              padding: "28px 24px",
              color: C.white,
            }}
          >
            <div className="tc-hero-inner">
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                    marginBottom: "6px",
                  }}
                >
                  You&apos;re all set!
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    opacity: 0.9,
                    marginBottom: "16px",
                    fontWeight: 500,
                  }}
                >
                  Thank you for your order.
                </div>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: "20px",
                    fontSize: "13.5px",
                    lineHeight: 2,
                    opacity: 0.85,
                    fontWeight: 500,
                  }}
                >
                  <li>Show this QR code at pickup</li>
                  <li>Enjoy your {drop?.title ?? "deal"}!</li>
                  {showSavings && (
                    <li>
                      You saved ${savings.toFixed(2)} <span aria-hidden>🎉</span>
                    </li>
                  )}
                </ol>
              </div>

              <div
                className="tc-qr-wrap"
                style={{
                  flexShrink: 0,
                  background: C.white,
                  borderRadius: "14px",
                  padding: "10px",
                  width: "140px",
                  height: "140px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                  position: "relative",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR code"
                  style={{
                    width: "120px",
                    height: "120px",
                    display: "block",
                    opacity: status === "active" ? 1 : 0.35,
                  }}
                />
                {status !== "active" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: F.mono,
                        fontSize: "14px",
                        fontWeight: 800,
                        letterSpacing: "0.12em",
                        color: status === "redeemed" ? C.redeemed : C.textMuted,
                        border: `2px solid ${status === "redeemed" ? C.redeemed : C.textMuted}`,
                        borderRadius: "6px",
                        padding: "3px 10px",
                        transform: "rotate(-12deg)",
                        background: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {status === "redeemed" ? "USED" : "EXPIRED"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Section 3: What You Ordered ── */}
          <div style={{ padding: "24px", background: C.white }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 800,
                    color: C.text,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.2,
                    marginBottom: "6px",
                  }}
                >
                  {drop?.title ?? "—"}
                </div>
                <div style={{ fontSize: "14px", color: C.textMuted, fontWeight: 500 }}>
                  {drop?.restaurantName ?? ""}
                  {drop?.restaurantName && (
                    <>
                      {" · "}× {quantity} {quantity === 1 ? "spot" : "spots"}
                    </>
                  )}
                </div>
              </div>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: F.mono,
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: statusPadding,
                  borderRadius: "9999px",
                  background: statusBg,
                  color: statusColor,
                }}
              >
                {statusLabel}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: "10px",
                marginTop: "16px",
              }}
            >
              <span
                style={{
                  fontFamily: F.mono,
                  fontSize: "28px",
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: "-0.02em",
                }}
              >
                ${Number(pricePaid).toFixed(2)}
              </span>
              {showSavings && originalTotal !== null && (
                <>
                  <span
                    style={{
                      fontFamily: F.mono,
                      fontSize: "15px",
                      fontWeight: 500,
                      color: C.textDim,
                      textDecoration: "line-through",
                    }}
                  >
                    ${originalTotal.toFixed(2)}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      background: C.greenBg,
                      color: C.greenFg,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      letterSpacing: "0.02em",
                    }}
                  >
                    Save ${savings.toFixed(2)}
                  </span>
                </>
              )}
            </div>

            <div
              style={{
                marginTop: "10px",
                fontFamily: F.mono,
                fontSize: "11px",
                color: C.textDim,
                letterSpacing: "0.05em",
                fontWeight: 500,
              }}
            >
              Token: {tokenDisplay}
            </div>
          </div>

          {/* ── Section 4: When & Where ── */}
          {drop && (
            <div style={{ background: C.dark, padding: "24px", color: C.white }}>
              <div className="tc-when-where">
                {/* WHEN */}
                <div>
                  <div
                    style={{
                      fontFamily: F.mono,
                      fontSize: "11px",
                      fontWeight: 700,
                      color: C.red,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: "8px",
                    }}
                  >
                    When:
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: C.white,
                      marginBottom: "4px",
                    }}
                  >
                    {dayDate}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "rgba(255,255,255,0.7)",
                      marginBottom: "10px",
                    }}
                  >
                    {timeWindow}
                  </div>
                  {countdown && (
                    <div
                      style={{
                        fontFamily: F.mono,
                        fontSize: "14px",
                        fontWeight: 600,
                        color: countdown.color,
                      }}
                    >
                      {countdown.label} {countdown.value}
                    </div>
                  )}
                </div>

                {/* WHERE */}
                <div>
                  <div
                    style={{
                      fontFamily: F.mono,
                      fontSize: "11px",
                      fontWeight: 700,
                      color: C.red,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: "8px",
                    }}
                  >
                    Where:
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: C.white,
                      marginBottom: "4px",
                    }}
                  >
                    {drop.restaurantName}
                  </div>
                  {drop.address && (
                    <div
                      style={{
                        fontSize: "13px",
                        color: "rgba(255,255,255,0.6)",
                        marginBottom: "12px",
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {drop.address}
                    </div>
                  )}
                  {directionsUrl && (
                    <a
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        background: C.red,
                        color: C.white,
                        padding: "9px 18px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 700,
                        textDecoration: "none",
                        boxShadow: C.redShadow,
                      }}
                    >
                      Get directions →
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Section 5: Footer ── */}
          <div
            style={{
              background: "#F3F4F6",
              padding: "20px 24px 40px",
              textAlign: "center",
              fontSize: "13px",
              color: C.textDim,
              fontWeight: 500,
            }}
          >
            {footerText}
          </div>
        </div>
      </div>
    </div>
  );
}
