"use client";

import { useEffect, useState } from "react";
import { DP } from "@/lib/theme/tokens";
import { formatDateFromIso, formatTimeWindowFromIso } from "@/lib/drops/helpers";
import { computeTicketPricing } from "@/lib/tickets/pricing";

// ─── Types ───────────────────────────────────────────────────────────

export type TicketStatus = "active" | "redeemed" | "expired";

export interface TicketDrop {
  title: string;
  restaurantName: string;
  price: number;
  originalPrice: number | null;
  /**
   * Authoritative UTC instants — the ONLY time input this component
   * takes. Both the displayed date/window and the countdown derive from
   * these via the shared Central-time formatter in lib/drops/helpers.
   *
   * The legacy `date`/`startTime`/`endTime` wall-clock strings were
   * deliberately removed: parsing a wall-clock string with `new Date()`
   * resolves in the VIEWER's timezone, which is the bug class this PR
   * exists to eliminate.
   */
  startTimeIso: string;
  endTimeIso: string;
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

// Colors sourced from the centralized DealsPro token file (local names kept).
const C = {
  page: DP.gray[50],
  white: DP.zinc[0],
  dark: DP.slate[800], // off-palette slate — centralized, not yet replaced
  red: DP.brand[500],
  redShadow: DP.shadow.brandGlow,
  text: DP.gray[900],
  textMuted: DP.gray[500],
  textDim: DP.gray[400],
  green: DP.success.fg,
  greenBg: DP.success.bgAlt,
  greenFg: DP.success.fgDeep,
  redeemed: DP.danger.strong,
  divider: DP.gray[200],
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

function toTimestamp(iso: string): number {
  return new Date(iso).getTime();
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

  const start = toTimestamp(drop.startTimeIso);
  const end = toTimestamp(drop.endTimeIso);

  if (now >= end) return null;

  const target = now < start ? start : end;
  const label = now < start ? "Starts in" : "Pickup ends in";
  const color = now < start ? DP.warning.soft : DP.success.light;

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

  // Shared, unit-tested framing math (lib/tickets/pricing.ts).
  // price_paid is the ORDER TOTAL; originalPrice is PER UNIT.
  const { originalTotal, savings, showSavings } = computeTicketPricing({
    pricePaid,
    originalPrice: drop?.originalPrice ?? null,
    quantity,
  });

  const statusLabel =
    status === "active" ? "✓ Active" : status === "redeemed" ? "Redeemed" : "Expired";
  const statusColor =
    status === "active" ? C.white : status === "redeemed" ? C.redeemed : C.textDim;
  const statusBg =
    status === "active" ? C.green : status === "redeemed" ? DP.danger.strongBg : DP.gray[50];
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

  // Shared Central-time formatter, fed the authoritative UTC instants —
  // no local time formatting in this component.
  const timeWindow = drop ? formatTimeWindowFromIso(drop.startTimeIso, drop.endTimeIso) : "";
  const dayDate = drop ? formatDateFromIso(drop.startTimeIso) : "";

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
                <span style={{ color: DP.dark.confirmModal }}>Deals</span>
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
              background: DP.gradient.ticketFront,
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

            {/*
              Price framing: every number is explicitly labelled.
              `pricePaid` is the ORDER TOTAL (the webhook writes
              price_paid = item.price * quantity), and `originalTotal` is
              likewise multiplied by quantity, so the two are directly
              comparable at any quantity. A bare crossed-out number used
              to sit next to the paid amount with no label, which read as
              ambiguous — it is now a labelled "Regular value" row.
            */}
            <div style={{ marginTop: "16px" }}>
              <div
                style={{
                  fontFamily: F.mono,
                  fontSize: "11px",
                  fontWeight: 700,
                  color: C.textMuted,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: "2px",
                }}
              >
                Paid
              </div>
              <div
                style={{
                  fontFamily: F.mono,
                  fontSize: "28px",
                  fontWeight: 700,
                  color: C.text,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}
              >
                ${Number(pricePaid).toFixed(2)}
              </div>

              <dl
                style={{
                  margin: "12px 0 0",
                  display: "grid",
                  gridTemplateColumns: "auto auto",
                  justifyContent: "start",
                  columnGap: "10px",
                  rowGap: "4px",
                  fontSize: "13px",
                }}
              >
                {showSavings && originalTotal !== null && (
                  <>
                    <dt style={{ color: C.textMuted, fontWeight: 500 }}>
                      Regular value
                    </dt>
                    <dd
                      style={{
                        margin: 0,
                        fontFamily: F.mono,
                        fontWeight: 600,
                        color: C.textMuted,
                      }}
                    >
                      ${originalTotal.toFixed(2)}
                    </dd>

                    <dt style={{ color: C.greenFg, fontWeight: 700 }}>
                      You saved
                    </dt>
                    <dd
                      style={{
                        margin: 0,
                        fontFamily: F.mono,
                        fontWeight: 700,
                        color: C.greenFg,
                      }}
                    >
                      ${savings.toFixed(2)}
                    </dd>
                  </>
                )}

                <dt style={{ color: C.textMuted, fontWeight: 500 }}>Quantity</dt>
                <dd
                  style={{
                    margin: 0,
                    fontFamily: F.mono,
                    fontWeight: 600,
                    color: C.textMuted,
                  }}
                >
                  {quantity}
                </dd>
              </dl>
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
              background: DP.gray[50],
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
