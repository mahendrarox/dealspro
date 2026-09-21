import type { Metadata } from "next";
import { resolveIntakeLink } from "@/lib/intake/session";
import { getLastPublishedPhoto } from "@/lib/intake/images";
import { todayCentral } from "@/lib/intake/extract";
import { DP } from "@/lib/theme/tokens";
import IntakeClient from "./client";

/**
 * The restaurant's private intake link.
 *
 * Outside Studio, outside `middleware.ts`'s `/admin/:path*` matcher, and
 * with no login: the signed token in the path is the entire credential,
 * so it is verified here on every request and again inside every server
 * action the page calls. A page-level check alone would be theatre.
 */

export const dynamic = "force-dynamic";

// Never let a token-bearing URL be indexed or previewed.
export const metadata: Metadata = {
  title: "Submit a Drop · DealsPro",
  robots: { index: false, follow: false, nocache: true },
};

const T = {
  bg: DP.dark.page,
  panel: DP.dark.rPanel,
  border: DP.dark.rBorder,
  red: DP.brand[500],
  text: "#fff",
  muted: DP.zinc[400],
  display: "'DM Sans', sans-serif",
};

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveIntakeLink(token);

  if (!link.ok) {
    // One neutral page for expired, tampered, forged, and deactivated.
    // Distinguishing them would tell an attacker which guess was closer.
    return (
      <InvalidLink
        message={
          link.reason === "inactive"
            ? "This restaurant isn't active on DealsPro right now."
            : link.reason === "unconfigured"
              ? "Drop submission isn't switched on yet."
              : "This link has expired or is no longer valid."
        }
      />
    );
  }

  const lastPhoto = await getLastPublishedPhoto(link.restaurant.id);

  return (
    <IntakeClient
      token={token}
      restaurantName={link.restaurant.name}
      restaurantCity={link.restaurant.city}
      lastPhoto={lastPhoto}
      anchorDate={todayCentral()}
    />
  );
}

function InvalidLink({ message }: { message: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: T.bg,
        fontFamily: T.display,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 8 }}>
          {message}
        </h1>
        <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.5 }}>
          Ask your DealsPro contact for a fresh submission link.
        </p>
      </div>
    </main>
  );
}
