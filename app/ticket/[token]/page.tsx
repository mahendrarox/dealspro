import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropByIdForServer } from "@/lib/drops/db";
import { formatTimeWindow, formatDate, isRedemptionValid } from "@/lib/drops/helpers";

export const dynamic = "force-dynamic";

const F = { display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" };

export default async function TicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("qr_token", token)
    .single();

  if (error || !order) {
    notFound();
  }

  const item = order.drop_item_id ? await getDropByIdForServer(order.drop_item_id) : null;
  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${token}`;
  const qrDataUrl = await QRCode.toDataURL(ticketUrl, {
    width: 240,
    margin: 2,
    color: { dark: "#18181B", light: "#FFFFFF" },
  });

  const isPaid = order.status === "paid";
  const isRedeemed = order.redemption_status === "redeemed";
  const expired = item ? !isRedemptionValid(item) : false;
  const pickupWindow = item ? formatTimeWindow(item) : "TBD";
  const dateStr = item ? formatDate(item) : "";
  const validUntil = item?.redemption_valid_until
    ? new Date(item.redemption_valid_until).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  // Status config
  let statusText = "";
  let statusBg = "";
  let statusColor = "";
  if (expired && !isRedeemed) {
    statusText = "EXPIRED";
    statusBg = "#FEE2E0";
    statusColor = "#F93A25";
  } else if (isRedeemed) {
    statusText = "REDEEMED";
    statusBg = "#FEE2E0";
    statusColor = "#F93A25";
  } else if (isPaid) {
    statusText = "READY TO USE";
    statusBg = "#DCFCE7";
    statusColor = "#16A34A";
  } else {
    statusText = order.status?.toUpperCase() ?? "UNKNOWN";
    statusBg = "#F7F7F8";
    statusColor = "#52525B";
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0F0F0F",
        fontFamily: F.display,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div style={{ maxWidth: "400px", width: "100%" }}>
        {/* White card */}
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
          }}
        >
          {/* Header */}
          <div style={{ padding: "32px 28px 24px", textAlign: "center" }}>
            <div
              style={{
                fontFamily: F.mono,
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "#F93A25",
                textTransform: "uppercase",
                marginBottom: "16px",
              }}
            >
              Your Deal Card
            </div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "#18181B",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                marginBottom: "4px",
              }}
            >
              {order.drop_title}
            </h1>
            <div style={{ fontSize: "14px", color: "#52525B", marginTop: "4px" }}>
              {order.restaurant_name}
            </div>

            {/* Status badge */}
            <div style={{ marginTop: "16px" }}>
              <span
                style={{
                  fontFamily: F.mono,
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "6px 16px",
                  borderRadius: "9999px",
                  background: statusBg,
                  color: statusColor,
                  display: "inline-block",
                }}
              >
                {statusText}
              </span>
            </div>
          </div>

          {/* Deal details */}
          <div style={{ padding: "0 28px 20px" }}>
            <div
              style={{
                background: "#F7F7F8",
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <Row label="Restaurant" value={order.restaurant_name} />
              {dateStr && <Row label="Date" value={dateStr} />}
              <Row label="Pickup" value={pickupWindow} />
              <Row label="Amount Paid" value={`$${Number(order.price_paid).toFixed(2)}`} highlight />
              {isRedeemed && order.redeemed_at && (
                <Row
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
          </div>

          {/* QR Code */}
          <div
            style={{
              padding: "0 28px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                padding: "16px",
                background: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid #E4E4E7",
                position: "relative",
                opacity: isRedeemed || expired ? 0.5 : 1,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR Code"
                width={220}
                height={220}
                style={{ display: "block" }}
              />
              {/* USED stamp overlay */}
              {(isRedeemed || expired) && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.6)",
                    borderRadius: "12px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: F.mono,
                      fontSize: "28px",
                      fontWeight: 900,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: isRedeemed ? "#F93A25" : "#A1A1AA",
                      border: `3px solid ${isRedeemed ? "#F93A25" : "#A1A1AA"}`,
                      padding: "6px 20px",
                      borderRadius: "8px",
                      transform: "rotate(-12deg)",
                    }}
                  >
                    {isRedeemed ? "USED" : "EXPIRED"}
                  </span>
                </div>
              )}
            </div>

            {/* Instructions */}
            {!isRedeemed && !expired && (
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "#52525B",
                  textAlign: "center",
                }}
              >
                Show this to staff at {order.restaurant_name}
              </div>
            )}
            {isRedeemed && (
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "#A1A1AA",
                  textAlign: "center",
                }}
              >
                This deal card has already been redeemed.
              </div>
            )}
            {expired && !isRedeemed && (
              <div
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "#F93A25",
                  textAlign: "center",
                }}
              >
                This deal card has expired.
              </div>
            )}
            {validUntil && !isRedeemed && !expired && (
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "12px",
                  color: "#A1A1AA",
                  textAlign: "center",
                }}
              >
                Valid until {validUntil} at 11:59 PM
              </div>
            )}
          </div>
        </div>

        {/* Back link */}
        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <a
            href="/"
            style={{
              fontSize: "14px",
              color: "#A1A1AA",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ← Browse More Deals
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: "13px", color: "#52525B" }}>{label}</span>
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
