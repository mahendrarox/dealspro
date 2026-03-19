import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";

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

  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${token}`;
  const qrDataUrl = await QRCode.toDataURL(ticketUrl, {
    width: 240,
    margin: 2,
    color: { dark: "#18181B", light: "#FFFFFF" },
  });

  const isPaid = order.status === "paid";
  const isRedeemed = order.status === "redeemed";

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
            DealsPro Drop
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
        </div>

        {/* Status Badge */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "16px 24px 0",
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "6px 16px",
              borderRadius: "9999px",
              background: isRedeemed ? "#E4E4E7" : "#DCFCE7",
              color: isRedeemed ? "#A1A1AA" : "#16A34A",
            }}
          >
            {isRedeemed ? "✓ Redeemed" : isPaid ? "✓ Paid · Ready to Use" : order.status}
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
              opacity: isRedeemed ? 0.4 : 1,
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
          </div>
          {isRedeemed && (
            <div
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "#A1A1AA",
                textAlign: "center",
              }}
            >
              This ticket has already been redeemed.
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
          <DetailRow label="Pickup Window" value="6–8 PM" />
          <DetailRow
            label="Amount Paid"
            value={`$${Number(order.price_paid).toFixed(2)}`}
            highlight
          />
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
          Show this QR code to staff at the restaurant to redeem.
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
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
