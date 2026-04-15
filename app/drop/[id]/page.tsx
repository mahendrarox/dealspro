import { getDropByIdForServer } from "@/lib/drops/db";
import DealClient from "./client";

export const dynamic = "force-dynamic";

const T = {
  red: "#F93A25",
  display: "'DM Sans', sans-serif",
};

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getDropByIdForServer(id);

  if (!item) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A0A0A",
          fontFamily: T.display,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
            This deal is no longer available
          </h1>
          <p style={{ color: "#A1A1AA", fontSize: 14, marginBottom: 16 }}>
            The drop you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <a href="/" style={{ color: T.red, textDecoration: "none", fontWeight: 600 }}>
            ← Back to DealsPro
          </a>
        </div>
      </div>
    );
  }

  return <DealClient initialItem={item} />;
}
