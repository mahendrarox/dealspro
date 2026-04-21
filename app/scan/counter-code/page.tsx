import QRCode from "qrcode";

export const dynamic = "force-static";

export default async function CounterCodePage() {
  const target =
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/scan`
      : "https://dealspro.ai/scan";

  const qrDataUrl = await QRCode.toDataURL(target, {
    width: 720,
    margin: 2,
    color: { dark: "#111114", light: "#FFFFFF" },
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        color: "#111114",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.14em",
          color: "#F93A25",
          textTransform: "uppercase",
          marginBottom: "10px",
        }}
      >
        DealsPro · Staff
      </div>
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          textAlign: "center",
          marginBottom: "6px",
        }}
      >
        Redeem a Deal Card
      </h1>
      <p
        style={{
          fontSize: "15px",
          color: "#52525B",
          marginBottom: "28px",
          textAlign: "center",
          maxWidth: "480px",
        }}
      >
        Scan this code with any phone to open the staff redemption tool.
      </p>

      <div
        style={{
          padding: "20px",
          background: "#FFFFFF",
          borderRadius: "24px",
          border: "1px solid #E4E4E7",
          boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR code for ${target}`}
          width={320}
          height={320}
          style={{ display: "block", width: "320px", height: "320px" }}
        />
      </div>

      <div
        style={{
          marginTop: "22px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "13px",
          color: "#52525B",
          letterSpacing: "0.02em",
          textAlign: "center",
          wordBreak: "break-all",
          maxWidth: "480px",
        }}
      >
        {target}
      </div>
    </div>
  );
}
