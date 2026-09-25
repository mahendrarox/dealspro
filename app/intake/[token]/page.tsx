import type { Metadata } from "next";
import { resolveIntakeCredential } from "@/lib/intake/session";
import { getLastPublishedPhoto } from "@/lib/intake/images";
import { todayCentral } from "@/lib/intake/extract";
import IntakeClient from "./client";
import IntakeLinkInvalid from "./invalid";

/**
 * LEGACY intake route: /intake/<signed JWT>.
 *
 * Superseded by the short /i/<code> links. Studio no longer mints these,
 * but the route stays alive so links already in partners' hands keep
 * working until their own 14-day expiry runs out — cutting them off at
 * deploy time would strand any restaurant mid-conversation.
 *
 * Set INTAKE_ALLOW_LEGACY_JWT=false to refuse them immediately; the
 * resolver then returns "legacy_disabled" and this page renders the same
 * neutral message as any other dead link.
 *
 * This file can be deleted once the last JWT link has expired.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submit a Drop · DealsPro",
  robots: { index: false, follow: false, nocache: true },
};

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveIntakeCredential(token);

  if (!link.ok) return <IntakeLinkInvalid reason={link.reason} />;

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
