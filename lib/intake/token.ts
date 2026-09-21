import { SignJWT, jwtVerify } from "jose";

/**
 * Restaurant intake link tokens.
 *
 * A signed, expiring, single-restaurant capability. The link IS the
 * credential — there is no restaurant login anywhere in DealsPro — so the
 * blast radius is deliberately tiny:
 *
 *   * A SEPARATE secret (`INTAKE_JWT_SECRET`). Never `ADMIN_JWT_SECRET`.
 *     An intake token and an admin session token are signed by different
 *     keys and carry different claims, so neither can ever be presented
 *     as the other.
 *   * Pinned `iss` + `aud`. Even a token signed with the right secret but
 *     minted for something else fails verification.
 *   * Short TTL (14 days default). Expiry is the revocation story.
 *   * `sub` is the restaurant UUID. Every downstream query scopes on the
 *     value returned from HERE — never on a restaurant id sent by the
 *     browser. That is the whole of restaurant isolation.
 *   * `jti` is a random token id. It is what we persist for audit, so a
 *     submission can be traced back to the link that produced it WITHOUT
 *     the raw signed token ever touching the database.
 *
 * Mirrors `lib/admin/auth.ts` (same `jose` primitives, same
 * throw-on-missing env getter) so there is one house style for signing.
 */

const ISSUER = "dealspro";
const AUDIENCE = "dealspro-restaurant-intake";
/** Separate audience so an upload receipt can never act as an intake link. */
const UPLOAD_AUDIENCE = "dealspro-intake-upload";

/** Upload receipts only need to survive one intake conversation. */
export const UPLOAD_RECEIPT_TTL_SECONDS = 60 * 60 * 2; // 2 hours

/** Default link lifetime. Expiry is how an intake link is revoked. */
export const INTAKE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

/** Minimum acceptable secret length. Longer than the admin minimum (16). */
export const INTAKE_SECRET_MIN_LENGTH = 32;

export type IntakeTokenClaims = {
  /** Restaurant UUID. The ONLY trusted source of tenancy. */
  restaurantId: string;
  /** Token id — persisted for audit instead of the raw token. */
  jti: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
};

function getSecret(): Uint8Array {
  const secret = process.env.INTAKE_JWT_SECRET;
  if (!secret || secret.length < INTAKE_SECRET_MIN_LENGTH) {
    throw new Error(
      `[intake-token] INTAKE_JWT_SECRET is missing or too short (min ${INTAKE_SECRET_MIN_LENGTH} chars)`,
    );
  }
  // Refuse to run if someone points intake at the admin secret. Sharing
  // one key would collapse two trust domains into one.
  if (process.env.ADMIN_JWT_SECRET && secret === process.env.ADMIN_JWT_SECRET) {
    throw new Error(
      "[intake-token] INTAKE_JWT_SECRET must differ from ADMIN_JWT_SECRET",
    );
  }
  return new TextEncoder().encode(secret);
}

/** True when a usable, correctly-separated intake secret is configured. */
export function isIntakeConfigured(): boolean {
  try {
    getSecret();
    return true;
  } catch {
    return false;
  }
}

function randomJti(): string {
  // Web Crypto — available in both the node and edge runtimes, so this
  // module stays usable from either without a node:crypto import.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint an intake link token for exactly one restaurant.
 *
 * The caller is responsible for having verified that the restaurant
 * exists and is active — this function only signs.
 */
export async function signIntakeToken(
  restaurantId: string,
  opts?: { ttlSeconds?: number; jti?: string },
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const ttl = opts?.ttlSeconds ?? INTAKE_TOKEN_TTL_SECONDS;
  const jti = opts?.jti ?? randomJti();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(restaurantId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(getSecret());

  return { token, jti, expiresAt };
}

/**
 * Verify an intake token. Returns null for ANY failure — bad signature,
 * tampered payload, expired, wrong issuer/audience, wrong algorithm,
 * missing subject, or a malformed string.
 *
 * Never throws for an untrusted input; a thrown error here would leak the
 * difference between "expired" and "forged" to the caller.
 */
export async function verifyIntakeToken(
  token: string | undefined | null,
): Promise<IntakeTokenClaims | null> {
  if (!token || typeof token !== "string") return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      // Pin the algorithm: blocks "alg: none" and any algorithm-confusion
      // attempt outright rather than relying on jose's defaults.
      algorithms: ["HS256"],
    });

    const restaurantId = typeof payload.sub === "string" ? payload.sub : null;
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!restaurantId || !jti) return null;

    return {
      restaurantId,
      jti,
      issuedAt: typeof payload.iat === "number" ? new Date(payload.iat * 1000) : null,
      expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// UPLOAD RECEIPTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * A signed receipt for one uploaded photo.
 *
 * Provenance (original filename, byte count, sha-256, EXIF presence) can
 * only be read from the ORIGINAL bytes, inside the upload route, before
 * `normalizeImage()` strips metadata on the way to WebP. The submit
 * action runs later, in a different request, and must not simply believe
 * a provenance blob the browser hands it — that would make the audit
 * trail forgeable by the party it is meant to hold accountable.
 *
 * So the upload route signs what it observed, the browser carries the
 * receipt, and the submit action verifies it. The receipt is bound to
 * both the restaurant and the exact stored URL, so it cannot be replayed
 * against a different photo or a different partner.
 */
export type UploadReceiptClaims = {
  restaurantId: string;
  imageUrl: string;
  provenance: Record<string, unknown>;
};

export async function signUploadReceipt(
  claims: UploadReceiptClaims,
): Promise<string> {
  return await new SignJWT({
    image_url: claims.imageUrl,
    provenance: claims.provenance,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.restaurantId)
    .setIssuer(ISSUER)
    .setAudience(UPLOAD_AUDIENCE)
    .setJti(randomJti())
    .setIssuedAt()
    .setExpirationTime(`${UPLOAD_RECEIPT_TTL_SECONDS}s`)
    .sign(getSecret());
}

/**
 * Verify an upload receipt against the restaurant and image URL the
 * submit action is actually processing. Returns null on any mismatch.
 */
export async function verifyUploadReceipt(
  receipt: string | undefined | null,
  expected: { restaurantId: string; imageUrl: string },
): Promise<Record<string, unknown> | null> {
  if (!receipt || typeof receipt !== "string") return null;
  try {
    const { payload } = await jwtVerify(receipt, getSecret(), {
      issuer: ISSUER,
      audience: UPLOAD_AUDIENCE,
      algorithms: ["HS256"],
    });
    if (payload.sub !== expected.restaurantId) return null;
    if (payload.image_url !== expected.imageUrl) return null;
    const provenance = payload.provenance;
    if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
      return null;
    }
    return provenance as Record<string, unknown>;
  } catch {
    return null;
  }
}
