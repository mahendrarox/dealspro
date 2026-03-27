import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropItem, formatTimeWindow, formatDate, isRedemptionValid } from "@/lib/constants";

export const dynamic = "force-dynamic";

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

  const item = order.drop_item_id ? getDropItem(order.drop_item_id) : null;
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

  // Determine status
  let statusText = "";
  let statusBg = "#DCFCE7";
  let statusColor = "#16A34A";
  if (expired && !isRedeemed) {
    statusText = "Expired";
    statusBg = "#FEE2E0";
    statusColor = "#F93A25";
  } else if (isRedeemed) {
    statusText = "✓ Redeemed";
    statusBg = "#E4E4E7";
    statusColor = "#A1A1AA";
  } else if (isPaid) {
    statusText = "✓ Paid · Ready to Use";
  } else {
    statusText = order.status;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F7F7F8",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "24px",
          overflow: "hidden",
          width: "100%",
          maxWidth: "400px",
          boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #111114, #1C1C21)",
            padding: "28px 24px 20px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.1em",
              color: "#F93A25",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Your Deal Card
          </div>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {order.drop_title}
          </div>
          <div style={{ fontSize: "14px", color: "#A1A1AA", marginTop: "6px" }}>
            {order.restaurant_name}
          </div>
          {dateStr && (
            <div style={{ fontSize: "13px", color: "#A1A1AA", marginTop: "4px" }}>
              📅 {dateStr} · {pickupWindow}
            </div>
          )}
        </div>

        {/* Status Badge */}
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 24px 0" }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "6px 16px",
              borderRadius: "9999px",
              background: statusBg,
              color: statusColor,
            }}
          >
            {statusText}
          </span>
        </div>

        {/* QR Code */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              padding: "16px",
              background: "#FFFFFF",
              borderRadius: "16px",
              border: "2px solid #E4E4E7",
              opacity: isRedeemed || expired ? 0.4 : 1,
              position: "relative",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QR Code"
              width={240}
              height={240}
              style={{ display: "block" }}
            />
            {(isRedeemed || expired) && (
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.7)",
                borderRadius: "16px",
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "14px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: isRedeemed ? "#A1A1AA" : "#F93A25",
                  background: "rgba(255,255,255,0.9)",
                  padding: "8px 16px",
                  borderRadius: "8px",
                }}>
                  {isRedeemed ? "REDEEMED" : "EXPIRED"}
                </span>
              </div>
            )}
          </div>
          {isRedeemed && (
            <div style={{ marginTop: "12px", fontSize: "13px", color: "#A1A1AA", textAlign: "center" }}>
              This deal card has already been redeemed.
            </div>
          )}
          {expired && !isRedeemed && (
            <div style={{ marginTop: "12px", fontSize: "13px", color: "#F93A25", textAlign: "center" }}>
              This deal card has expired.
            </div>
          )}
        </div>

        {/* Order Details */}
        <div
          style={{
            borderTop: "1px solid #E4E4E7",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <DetailRow label="Restaurant" value={order.restaurant_name} />
          {dateStr && <DetailRow label="Date" value={dateStr} />}
          <DetailRow label="Pickup Window" value={pickupWindow} />
          <DetailRow label="Amount Paid" value={`$${Number(order.price_paid).toFixed(2)}`} highlight />
          {isRedeemed && order.redeemed_at && (
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

        {/* Footer */}
        <div
          style={{
            background: "#F7F7F8",
            padding: "14px 24px",
            textAlign: "center",
            fontSize: "12px",
            color: "#A1A1AA",
            borderTop: "1px solid #E4E4E7",
          }}
        >
          {expired
            ? "This deal card has expired."
            : isRedeemed
            ? "This deal card has been redeemed. Thank you!"
            : validUntil
            ? `Show this deal card to staff. Valid until ${validUntil} at 11:59 PM.`
            : "Show this deal card to staff at the restaurant to redeem."}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
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
