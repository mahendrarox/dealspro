import { adminDb } from "@/lib/supabase-admin";
import { verifyIntakeToken, type IntakeTokenClaims } from "./token";
import {
  getLegacyCutoff,
  isLegacyTokenCutOff,
  looksLikeCode,
  resolveCode,
  touchLink,
  type IntakeLinkRow,
} from "./links";

/**
 * Resolving an intake credential to a restaurant.
 *
 * This is the single chokepoint for restaurant isolation. Every intake
 * server action and both intake routes call `resolveIntakeCredential`
 * and use the restaurant it returns. No code path anywhere accepts a
 * restaurant id from the browser.
 *
 * TWO CREDENTIAL FORMS are accepted:
 *
 *   1. A short code from /i/<code> — the current form. Authority comes
 *      from a row in `intake_links`, so revocation and expiry are
 *      re-read from the database on EVERY request.
 *   2. A legacy signed JWT from /intake/<token> — the previous form.
 *      Still honoured so links already in partners' hands keep working
 *      until their own 14-day clock runs out. Studio no longer mints
 *      these. Set INTAKE_ALLOW_LEGACY_JWT=false to cut them off
 *      immediately.
 *
 * Checks applied to BOTH forms, on every request (not just when the link
 * is first opened):
 *   * the credential is well-formed and currently valid
 *   * it has not expired
 *   * (short codes) it has not been revoked
 *   * the restaurant still exists and is still active
 *
 * The last check is the revocation lever that needs no link management
 * at all: deactivating a partner in Studio kills every outstanding
 * credential for them, of either form, on the next request.
 */

export type IntakeRestaurant = {
  id: string;
  name: string;
  city: string;
  slug: string | null;
};

export type IntakeLinkFailure =
  | "invalid"
  | "expired"
  | "revoked"
  | "inactive"
  | "unconfigured"
  | "legacy_disabled";

/** Which credential form resolved, for audit and for Studio messaging. */
export type IntakeCredentialKind = "short_code" | "legacy_jwt";

export type IntakeLinkResult =
  | {
      ok: true;
      restaurant: IntakeRestaurant;
      kind: IntakeCredentialKind;
      /** Stable identifier of the link, persisted with any submission. */
      linkId: string;
      issuedAt: Date | null;
      expiresAt: Date | null;
      /** Present only for short codes. */
      link: IntakeLinkRow | null;
    }
  | { ok: false; reason: IntakeLinkFailure };

function legacyJwtAllowed(): boolean {
  return process.env.INTAKE_ALLOW_LEGACY_JWT !== "false";
}

export async function resolveIntakeCredential(
  credential: string | undefined | null,
): Promise<IntakeLinkResult> {
  const raw = (credential ?? "").trim();
  if (!raw) return { ok: false, reason: "invalid" };

  // ── Short code ────────────────────────────────────────────────────
  if (looksLikeCode(raw)) {
    const resolved = await resolveCode(raw);
    if (!resolved.ok) {
      if (resolved.reason === "unavailable") return { ok: false, reason: "unconfigured" };
      if (resolved.reason === "revoked") return { ok: false, reason: "revoked" };
      if (resolved.reason === "expired") return { ok: false, reason: "expired" };
      return { ok: false, reason: "invalid" };
    }

    const restaurant = await loadActiveRestaurant(resolved.link.restaurant_id);
    if (!restaurant.ok) return { ok: false, reason: restaurant.reason };

    // Bookkeeping only; throttled and never allowed to fail the request.
    void touchLink(resolved.link.id);

    return {
      ok: true,
      restaurant: restaurant.restaurant,
      kind: "short_code",
      linkId: resolved.link.id,
      issuedAt: new Date(resolved.link.created_at),
      expiresAt: new Date(resolved.link.expires_at),
      link: resolved.link,
    };
  }

  // ── Legacy JWT ────────────────────────────────────────────────────
  if (!legacyJwtAllowed()) return { ok: false, reason: "legacy_disabled" };

  let claims: IntakeTokenClaims | null;
  try {
    claims = await verifyIntakeToken(raw);
  } catch {
    return { ok: false, reason: "unconfigured" };
  }
  if (!claims) return { ok: false, reason: "invalid" };

  // Per-restaurant revocation for a credential that has no row to revoke.
  // Set by "Revoke all" and "Replace", so those actions really do close
  // EVERY outstanding credential for the partner, not just the short ones.
  const cutoff = await getLegacyCutoff(claims.restaurantId);
  if (isLegacyTokenCutOff(claims.issuedAt, cutoff)) {
    return { ok: false, reason: "revoked" };
  }

  const restaurant = await loadActiveRestaurant(claims.restaurantId);
  if (!restaurant.ok) return { ok: false, reason: restaurant.reason };

  return {
    ok: true,
    restaurant: restaurant.restaurant,
    kind: "legacy_jwt",
    linkId: claims.jti,
    issuedAt: claims.issuedAt,
    expiresAt: claims.expiresAt,
    link: null,
  };
}

type RestaurantLoad =
  | { ok: true; restaurant: IntakeRestaurant }
  | { ok: false; reason: "invalid" | "inactive" };

async function loadActiveRestaurant(restaurantId: string): Promise<RestaurantLoad> {
  const { data, error } = await adminDb
    .from("restaurants")
    .select("id, name, city, slug, is_active")
    .eq("id", restaurantId)
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
  };
}

/**
 * Backwards-compatible alias.
 *
 * The parameter was called `token` when a JWT was the only credential.
 * Kept so existing call sites read unchanged while the concept widens.
 */
export const resolveIntakeLink = resolveIntakeCredential;
