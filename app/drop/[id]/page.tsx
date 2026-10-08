import { getDropByIdForServer } from "@/lib/drops/db";
import { tagFromSearchParams } from "@/lib/attribution/tag";
import DealClient from "./client";

export const dynamic = "force-dynamic";

const T = {
  red: "#F93A25",
  display: "'DM Sans', sans-serif",
};

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;

  // Channel attribution is read HERE, on the server, and handed down as a
  // prop. Reading it in the client on mount would leave a window in which
  // the page is interactive but the tag is not yet known — short, but long
  // enough for a fast tap on Reserve to produce an unattributed order.
  // The page is already `force-dynamic`, so this costs nothing.
  const tag = tagFromSearchParams(await searchParams);

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

  return <DealClient initialItem={item} tag={tag} />;
}
