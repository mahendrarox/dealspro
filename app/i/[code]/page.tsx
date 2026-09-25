import type { Metadata } from "next";
import { resolveIntakeCredential } from "@/lib/intake/session";
import { getLastPublishedPhoto } from "@/lib/intake/images";
import { todayCentral } from "@/lib/intake/extract";
import IntakeClient from "@/app/intake/[token]/client";
import IntakeLinkInvalid from "@/app/intake/[token]/invalid";

/**
 * The short private intake link: /i/<code>.
 *
 * Short enough to read over the phone or put in a text message, which
 * the ~250-character JWT at /intake/<token> never was. The code is
 * opaque — its authority comes entirely from a row in `intake_links` —
 * so revocation and expiry are re-read from the database here on every
 * request, and again inside every server action this page calls. A
 * page-level check alone would be theatre.
 *
 * Renders the same client component as the legacy route; only the way
 * the credential is carried differs.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit a Drop · DealsPro",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ShortIntakePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const link = await resolveIntakeCredential(code);

  if (!link.ok) {
    // One neutral page for expired, revoked, forged and deactivated.
    // Distinguishing them would confirm to someone probing codes that
    // they had found a real one.
    return <IntakeLinkInvalid reason={link.reason} />;
  }

  const lastPhoto = await getLastPublishedPhoto(link.restaurant.id);

  return (
    <IntakeClient
      token={code}
      restaurantName={link.restaurant.name}
      restaurantCity={link.restaurant.city}
      lastPhoto={lastPhoto}
      anchorDate={todayCentral()}
    />
  );
}
