"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

// ─── Types ───────────────────────────────────────────────────────────

type DropItem = {
  id: string;
  title: string;
  restaurant_name: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  original_price: number;
  redemption_valid_until: string;
};

type Order = {
  id: string;
  drop_title: string;
  restaurant_name: string;
  drop_item_id?: string;
  price_paid: number;
  quantity?: number;
  status: string;
  redemption_status?: string;
  qr_token: string;
  created_at: string;
  redeemed_at?: string;
  phone?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extract a token from either a full ticket URL or a bare token string. */
function extractToken(scanned: string | null | undefined): string | null {
  if (!scanned) return null;
  const s = scanned.trim();
  if (!s) return null;
  if (s.includes("/ticket/")) {
    return s.split("/ticket/")[1].split("?")[0].split("#")[0] || null;
  }
  return s;
}

/** 10 digits means phone; anything else is treated as a token. */
function classifyInput(raw: string): { kind: "token" | "phone"; value: string } {
  const trimmed = raw.trim();
  if (trimmed.includes("/ticket/")) {
    const token = extractToken(trimmed);
    return { kind: "token", value: token || trimmed };
  }
  if (trimmed.length > 12) return { kind: "token", value: trimmed };
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return { kind: "phone", value: digits };
  return { kind: "token", value: trimmed };
}

function formatFullPhone(phone?: string | null): string {
  if (!phone) return "—";
  const digits = String(phone).replace(/\D/g, "");
  let ten = digits;
  if (digits.length === 11 && digits[0] === "1") ten = digits.slice(1);
  if (ten.length !== 10) return String(phone);
  return `+1 (${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function telHref(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return null;
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
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

// ─── Component ───────────────────────────────────────────────────────

export default function ScanPage() {
  const [input, setInput] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [dropItem, setDropItem] = useState<DropItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemed, setRedeemed] = useState(false);

  // Phone-search results (when input is a 10-digit phone)
  const [phoneResults, setPhoneResults] = useState<Order[]>([]);
  const [phoneRedeeming, setPhoneRedeeming] = useState<string | null>(null);

  // Camera / scanner
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);
  const scannerElementId = "scan-region";
  const [scannerState, setScannerState] = useState<
    "idle" | "starting" | "active" | "denied"
  >("idle");
  const [scannerError, setScannerError] = useState("");

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      }
    };
  }, []);

  const stopScanner = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
    } catch {
      // already stopped or never started
    }
    try {
      scannerRef.current.clear();
    } catch {
      // ignore
    }
    scannerRef.current = null;
  };

  const startScanner = async () => {
    setScannerError("");
    setScannerState("starting");
    isProcessingRef.current = false;

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerElementId);
      }
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Guard against multiple detections queued between .stop() call
          // and the stream actually ending.
          if (isProcessingRef.current) return;
          isProcessingRef.current = true;

          await stopScanner();
          setScannerState("idle");

          const token = extractToken(decodedText);
          if (token) {
            setInput(token);
            await lookupToken(token);
          }
        },
        () => {
          // Per-frame scan failures — expected while the frame settles.
          // Silence them to avoid flooding the console.
        },
      );
      setScannerState("active");
    } catch (err) {
      console.error("[scan] camera error:", err);
      const raw =
        err instanceof Error ? err.message : String(err ?? "Camera access failed");
      setScannerError(raw);
      setScannerState("denied");
      // Release any partial scanner instance so the next retry starts clean.
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch {
          // ignore
        }
        scannerRef.current = null;
      }
    }
  };

  const lookupToken = async (token: string) => {
    setLoading(true);
    setError("");
    setOrder(null);
    setDropItem(null);
    setRedeemed(false);
    setRedeemError("");
    setPhoneResults([]);

    try {
      const res = await fetch(`/api/order?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Order not found");
      } else {
        setOrder(data.order);
        if (data.dropItem) setDropItem(data.dropItem);
        if (
          data.order.redemption_status === "redeemed" ||
          data.order.status === "redeemed"
        ) {
          setRedeemed(true);
        }
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const lookupPhone = async (digits: string) => {
    setLoading(true);
    setError("");
    setOrder(null);
    setDropItem(null);
    setRedeemed(false);
    setRedeemError("");
    setPhoneResults([]);

    try {
      const res = await fetch(
        `/api/biz/phone-search?phone=${encodeURIComponent(digits)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Search failed");
      } else if (!data.orders || data.orders.length === 0) {
        setError("No unredeemed orders found for this number.");
      } else {
        setPhoneResults(data.orders);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    const raw = input.trim();
    if (!raw) return;
    const { kind, value } = classifyInput(raw);
    if (kind === "phone") {
      await lookupPhone(value);
    } else {
      const token = extractToken(value) || value;
      await lookupToken(token);
    }
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
      }
    } catch {
      setRedeemError("Network error. Please try again.");
    }
    setRedeeming(false);
  };

  const redeemFromPhone = async (phoneOrder: Order) => {
    setPhoneRedeeming(phoneOrder.qr_token);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: phoneOrder.qr_token }),
      });
      const data = await res.json();
      if (res.ok) {
        // After redeeming, show the full order card in its redeemed state.
        setOrder(data.order || phoneOrder);
        setRedeemed(true);
        setPhoneResults([]);
      } else {
        setError(data.error || "Redemption failed");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setPhoneRedeeming(null);
  };

  const scanAnother = () => {
    setInput("");
    setOrder(null);
    setDropItem(null);
    setRedeemed(false);
    setRedeemError("");
    setError("");
    setPhoneResults([]);
  };

  // ─── UI ────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#111114",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 16px 48px",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
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
            fontSize: "26px",
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.02em",
          }}
        >
          Redeem a Deal Card
        </h1>
        <p style={{ fontSize: "14px", color: "#71717A", marginTop: "6px" }}>
          Point the camera at the customer&apos;s QR code.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: "460px" }}>
        {/* Scanner */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            background: "#0A0A0D",
            borderRadius: "20px",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: "16px",
          }}
        >
          <div
            id={scannerElementId}
            style={{
              width: "100%",
              height: "100%",
              display: scannerState === "active" ? "block" : "none",
              background: "#000",
            }}
          />

          {scannerState === "active" && (
            <div
              style={{
                position: "absolute",
                inset: "14%",
                border: "2px solid rgba(249,58,37,0.9)",
                borderRadius: "16px",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.35) inset",
                pointerEvents: "none",
              }}
            />
          )}

          {scannerState !== "active" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                textAlign: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  fontSize: "44px",
                  lineHeight: 1,
                }}
                aria-hidden
              >
                📷
              </div>
              <div
                style={{ color: "#E4E4E7", fontSize: "15px", fontWeight: 600 }}
              >
                {scannerState === "denied"
                  ? "Camera access denied — use manual entry below"
                  : scannerState === "starting"
                    ? "Starting camera…"
                    : "Ready to scan QR codes"}
              </div>
              {scannerError && (
                <div style={{ color: "#F93A25", fontSize: "12px" }}>
                  {scannerError}
                </div>
              )}
              <button
                onClick={startScanner}
                disabled={scannerState === "starting"}
                style={{
                  padding: "12px 24px",
                  background: "#F93A25",
                  border: "none",
                  borderRadius: "12px",
                  color: "#FFFFFF",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: "15px",
                  cursor: scannerState === "starting" ? "default" : "pointer",
                  opacity: scannerState === "starting" ? 0.7 : 1,
                }}
              >
                {scannerState === "denied" ? "Try again" : "Start scanning"}
              </button>
            </div>
          )}

          {scannerState === "active" && (
            <button
              onClick={() => {
                stopScanner();
                setScannerState("idle");
              }}
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                padding: "6px 12px",
                background: "rgba(0,0,0,0.55)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "8px",
                color: "#FFFFFF",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Stop
            </button>
          )}
        </div>

        {/* Manual entry */}
        <div
          style={{
            background: "#1C1C21",
            borderRadius: "20px",
            padding: "20px",
            border: "1px solid rgba(255,255,255,0.06)",
            marginBottom: "16px",
          }}
        >
          <label
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 600,
              color: "#71717A",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "8px",
            }}
          >
            Enter code or phone number
          </label>
          <input
            type="text"
            placeholder="Token, ticket URL, or 10-digit phone"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
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
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
            style={{
              width: "100%",
              padding: "14px",
              background: input.trim() ? "#F93A25" : "#1C1C21",
              border: input.trim()
                ? "none"
                : "2px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              color: input.trim() ? "#FFFFFF" : "#71717A",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: "15px",
              cursor: input.trim() ? "pointer" : "default",
              transition: "all 200ms ease",
            }}
          >
            {loading ? "Looking up…" : "Look Up Order"}
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

        {/* Phone-search results */}
        {phoneResults.length > 0 && (
          <div
            style={{
              background: "#1C1C21",
              borderRadius: "20px",
              padding: "20px",
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#71717A",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "12px",
              }}
            >
              {phoneResults.length} unredeemed order
              {phoneResults.length !== 1 ? "s" : ""} found
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {phoneResults.map((o) => (
                <div
                  key={o.id}
                  style={{
                    background: "#111114",
                    borderRadius: "12px",
                    padding: "14px 16px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#FFFFFF",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {o.drop_title}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#71717A",
                        marginTop: "3px",
                      }}
                    >
                      × {o.quantity ?? 1}{" "}
                      {o.quantity && o.quantity > 1 ? "spots" : "spot"}
                      {" · "}
                      {new Date(o.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => redeemFromPhone(o)}
                    disabled={phoneRedeeming === o.qr_token}
                    style={{
                      padding: "10px 18px",
                      background: "#16A34A",
                      border: "none",
                      borderRadius: "8px",
                      color: "#FFFFFF",
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: "13px",
                      cursor:
                        phoneRedeeming === o.qr_token ? "default" : "pointer",
                      opacity: phoneRedeeming === o.qr_token ? 0.6 : 1,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {phoneRedeeming === o.qr_token ? "…" : "Redeem"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Order card */}
        {order && (
          <OrderCard
            order={order}
            dropItem={dropItem}
            redeemed={redeemed}
            redeeming={redeeming}
            redeemError={redeemError}
            onRedeem={confirmRedeem}
            onScanAnother={scanAnother}
          />
        )}
      </div>
    </div>
  );
}

// ─── Order card ──────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  dropItem: DropItem | null;
  redeemed: boolean;
  redeeming: boolean;
  redeemError: string;
  onRedeem: () => void;
  onScanAnother: () => void;
}

function OrderCard({
  order,
  dropItem,
  redeemed,
  redeeming,
  redeemError,
  onRedeem,
  onScanAnother,
}: OrderCardProps) {
  const now = Date.now();
  const expiresAt = dropItem?.redemption_valid_until
    ? new Date(dropItem.redemption_valid_until).getTime()
    : null;
  const expired = expiresAt !== null && now >= expiresAt;

  const status: "active" | "redeemed" | "expired" = redeemed
    ? "redeemed"
    : expired
      ? "expired"
      : "active";

  const statusBg =
    status === "active"
      ? "#16A34A"
      : status === "redeemed"
        ? "rgba(239,68,68,0.15)"
        : "rgba(161,161,170,0.15)";
  const statusColor =
    status === "active"
      ? "#FFFFFF"
      : status === "redeemed"
        ? "#EF4444"
        : "#A1A1AA";
  const statusLabel =
    status === "active"
      ? "✓ Active"
      : status === "redeemed"
        ? "Redeemed"
        : "Expired";

  const phone = formatFullPhone(order.phone);
  const phoneHref = telHref(order.phone);
  const qty = order.quantity ?? 1;

  return (
    <div
      style={{
        background: "#1C1C21",
        borderRadius: "20px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#FFFFFF" }}>
            {order.drop_title}
          </div>
          <div
            style={{ fontSize: "13px", color: "#A1A1AA", marginTop: "2px" }}
          >
            {order.restaurant_name}
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: status === "active" ? "6px 18px" : "5px 12px",
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
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <DetailRow label="Quantity" value={`× ${qty} ${qty > 1 ? "spots" : "spot"}`} />
        <DetailRow
          label="Amount Paid"
          value={`$${Number(order.price_paid).toFixed(2)}`}
        />
        {dropItem && (
          <>
            <DetailRow label="Date" value={formatDate(dropItem.date)} />
            <DetailRow
              label="Pickup"
              value={formatTimeWindow(dropItem.start_time, dropItem.end_time)}
            />
          </>
        )}
        <DetailRow label="Phone" value={phone} mono />
        <DetailRow
          label="Order ID"
          value={order.id.slice(0, 8).toUpperCase()}
          mono
        />
        {redeemed && order.redeemed_at && (
          <DetailRow
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

      <div
        style={{
          padding: "0 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {phoneHref && (
          <a
            href={phoneHref}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "100%",
              padding: "12px",
              background: "#1F2937",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "12px",
              color: "#FFFFFF",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              fontSize: "14px",
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            <span aria-hidden>📞</span> Call Customer
          </a>
        )}

        {status === "active" && (
          <button
            onClick={onRedeem}
            disabled={redeeming}
            style={{
              width: "100%",
              padding: "16px",
              background: "#F93A25",
              border: "none",
              borderRadius: "12px",
              color: "#FFFFFF",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: "16px",
              cursor: redeeming ? "default" : "pointer",
              opacity: redeeming ? 0.6 : 1,
              transition: "opacity 150ms ease",
              boxSizing: "border-box",
              boxShadow: "0 6px 18px rgba(249,58,37,0.35)",
            }}
          >
            {redeeming ? "Confirming…" : "Mark as Redeemed"}
          </button>
        )}

        {status === "redeemed" && (
          <>
            <div
              style={{
                width: "100%",
                padding: "14px 16px",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "12px",
                color: "#FECACA",
                fontWeight: 600,
                fontSize: "14px",
                textAlign: "center",
                boxSizing: "border-box",
              }}
            >
              Already redeemed
              {order.redeemed_at
                ? ` on ${new Date(order.redeemed_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : ""}
              .
            </div>
            <button
              onClick={onScanAnother}
              style={{
                width: "100%",
                padding: "14px",
                background: "#F93A25",
                border: "none",
                borderRadius: "12px",
                color: "#FFFFFF",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
                boxSizing: "border-box",
              }}
            >
              Scan another
            </button>
          </>
        )}

        {status === "expired" && (
          <div
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "rgba(161,161,170,0.1)",
              border: "1px solid rgba(161,161,170,0.2)",
              borderRadius: "12px",
              color: "#A1A1AA",
              fontWeight: 600,
              fontSize: "14px",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            This deal has expired.
          </div>
        )}

        {redeemError && (
          <div
            style={{
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
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <span style={{ fontSize: "13px", color: "#71717A" }}>{label}</span>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#FFFFFF",
          fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}
