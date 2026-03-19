import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (session_id) {
    // Try to find the order by stripe session ID (may take a moment for webhook to fire)
    const { data: order } = await supabase
      .from("orders")
      .select("qr_token")
      .eq("stripe_session_id", session_id)
      .single();

    if (order?.qr_token) {
      redirect(`/ticket/${order.qr_token}`);
    }
  }

  // Webhook hasn't fired yet — show confirmation page
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
        textAlign: "center",
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "24px",
          padding: "48px 32px",
          maxWidth: "400px",
          width: "100%",
          boxShadow: "0 8px 40px rgba(0,0,0,0.1)",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "#DCFCE7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#18181B",
            letterSpacing: "-0.02em",
            marginBottom: "12px",
          }}
        >
          Payment Confirmed!
        </h1>

        <p style={{ fontSize: "15px", color: "#52525B", lineHeight: 1.6, marginBottom: "24px" }}>
          Your DealsPro ticket is on its way. Check your phone — we&apos;re sending you a link to your QR code now.
        </p>

        <div
          style={{
            background: "#F7F7F8",
            borderRadius: "12px",
            padding: "16px",
            fontSize: "13px",
            color: "#52525B",
            lineHeight: 1.5,
          }}
        >
          📍 <strong>Tikka Grill</strong><br />
          🕕 Pickup: <strong>6–8 PM</strong><br />
          💳 Paid: <strong>$9.99</strong>
        </div>

        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: "24px",
            fontSize: "14px",
            color: "#F93A25",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Back to DealsPro
        </a>
      </div>
    </div>
  );
}
