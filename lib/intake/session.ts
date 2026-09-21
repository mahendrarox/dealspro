import { adminDb } from "@/lib/supabase-admin";
import { verifyIntakeToken, type IntakeTokenClaims } from "./token";

/**
 * Resolving an intake link to a restaurant.
 *
 * This is the single chokepoint for restaurant isolation. Every intake
 * server action and the intake page itself call `resolveIntakeLink` and
 * use the restaurant it returns. No code path anywhere accepts a
 * restaurant id from the browser.
 *
 * Two checks, both required on EVERY request (not just when the link is
 * first opened):
 *   1. the token verifies — signature, issuer, audience, algorithm, expiry
 *   2. the restaurant still exists and is still active
 *
 * Check 2 is the revocation lever that does not need a schema change:
 * deactivating a partner in Studio kills every outstanding link for that
 * partner on the next request.
 */

export type IntakeRestaurant = {
  id: string;
  name: string;
  city: string;
  slug: string | null;
};

export type IntakeLinkFailure = "invalid" | "inactive" | "unconfigured";

export type IntakeLinkResult =
  | { ok: true; restaurant: IntakeRestaurant; claims: IntakeTokenClaims }
  | { ok: false; reason: IntakeLinkFailure };

export async function resolveIntakeLink(
  token: string | undefined | null,
): Promise<IntakeLinkResult> {
  let claims: IntakeTokenClaims | null;
  try {
    claims = await verifyIntakeToken(token);
  } catch {
    // Only thrown when INTAKE_JWT_SECRET is missing/misconfigured —
    // distinguishable from a bad token so the operator sees a useful
    // message while the visitor sees the same neutral one either way.
    return { ok: false, reason: "unconfigured" };
  }
  if (!claims) return { ok: false, reason: "invalid" };

  const { data, error } = await adminDb
    .from("restaurants")
    .select("id, name, city, slug, is_active")
    .eq("id", claims.restaurantId)
    .maybeSingle();

  if (error) {
    console.error("[intake/session] restaurant lookup failed:", error.message);
    return { ok: false, reason: "invalid" };
  }
  if (!data) return { ok: false, reason: "invalid" };

  const row = data as IntakeRestaurant & { is_active: boolean };
  if (row.is_active !== true) return { ok: false, reason: "inactive" };

  return {
    ok: true,
    restaurant: { id: row.id, name: row.name, city: row.city, slug: row.slug },
    claims,
  };
}
