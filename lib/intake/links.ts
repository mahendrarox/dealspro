import crypto from "crypto";
import { adminDb } from "@/lib/supabase-admin";
import {
  ENVELOPE_VERSION,
  decryptCode,
  encryptCode,
  isLinkCryptoConfigured,
} from "./link-crypto";

/**
 * Short private intake links: /i/<code>.
 *
 * The code is opaque. It carries no payload, no signature and no claims —
 * everything it authorises comes from a row in `intake_links`. That is the
 * whole point: a self-describing token (the previous JWT) cannot be
 * revoked or replaced without a key rotation that invalidates every link
 * at once, and it cannot be short.
 *
 * Handling rules, which the rest of the codebase depends on:
 *
 *   * `sha256(normalized code)` is what VALIDATION uses, always. It is
 *     unique, indexed, and irreversible, so the resolution path can
 *     never be turned into a way to read codes out.
 *   * The code is additionally stored ENCRYPTED (`code_encrypted`) under
 *     a dedicated server-only key that is not in the database, so an
 *     authenticated operator can copy or re-open an existing active link
 *     instead of replacing it. See `./link-crypto`.
 *   * The plaintext is never logged and never written anywhere else.
 *     Rows created before this feature — or in an environment with no
 *     key — have `code_encrypted = NULL` and keep working unchanged;
 *     they simply cannot be re-shown.
 *   * Resolution is a single indexed lookup on that hash. Expiry and
 *     revocation are re-evaluated on EVERY resolution, so revoking a link
 *     takes effect on the restaurant's next request.
 */

/**
 * base64url alphabet, as produced by `Buffer.toString("base64url")`:
 * A–Z, a–z, 0–9, `-` and `_`. Note what that means downstream — codes are
 * CASE SENSITIVE, and `-`/`_` are legitimate characters that must never
 * be stripped as if they were separators someone added for readability.
 */
const CODE_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 16 cryptographically random bytes = 128 bits, encoded as 22 base64url
 * characters with no padding.
 *
 * Entropy comes from `crypto.randomBytes` and the encoding is a straight
 * base conversion, so the distribution is uniform by construction — there
 * is no modulo step and therefore no sampling bias to defend against.
 */
export const CODE_ENTROPY_BYTES = 16; // 128 bits
export const CODE_LENGTH = 22; // base64url(16 bytes), unpadded

/** How much of the code Studio may show to tell two links apart. */
export const CODE_PREFIX_LENGTH = 6;

/** Default lifetime, unchanged from the JWT links it replaces. */
export const INTAKE_LINK_TTL_DAYS = 14;

export type IntakeLinkRow = {
  id: string;
  restaurant_id: string;
  code_hash: string;
  code_prefix: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  replaced_by: string | null;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
  /** AES-256-GCM envelope, or null for a hash-only legacy row. */
  code_encrypted?: string | null;
  code_enc_version?: number | null;
};

/** Columns that exist from migration-010 onwards. */
export const LINK_BASE_COLS =
  "id, restaurant_id, code_hash, code_prefix, expires_at, revoked_at, revoked_by, revoke_reason, replaced_by, created_by, created_at, last_used_at, use_count";

/** Columns added by migration-011. */
export const LINK_CIPHER_COLS = "code_encrypted, code_enc_version";

export const LINK_SELECT_COLS = `${LINK_BASE_COLS}, ${LINK_CIPHER_COLS}`;

/**
 * Whether migration-011 has been applied, as learned from the database.
 *
 * `null` means "not yet known, assume present". The first query that
 * comes back complaining about a missing column flips this to false for
 * the life of the process, so the fallback costs one wasted round trip
 * total rather than one per request. A deploy that lands before the
 * migration therefore degrades to hash-only behaviour instead of
 * throwing, which is the whole point of the column being additive.
 */
let cipherColumnsPresent: boolean | null = null;

function selectCols(): string {
  return cipherColumnsPresent === false ? LINK_BASE_COLS : LINK_SELECT_COLS;
}

/**
 * True when this error means migration-011 is missing. Also records the
 * fact, so the caller's retry is the last one that will ever be needed.
 */
function noteMissingCipherColumns(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  const missing =
    error.code === "42703" || /code_encrypted|code_enc_version/i.test(error.message ?? "");
  if (missing) cipherColumnsPresent = false;
  return missing;
}

/** Test seam: reset the learned column state between cases. */
export function resetCipherColumnCache(): void {
  cipherColumnsPresent = null;
}

/**
 * True when the error means migration-010 has not been applied yet.
 * Mirrors `isMissingSubmissionsTable` so a deploy that lands before the
 * migration degrades to a clear message instead of a stack trace.
 */
export function isMissingLinksTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    /intake_links|intake_legacy_cutoffs/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? "")
  );
}

export const LINKS_MIGRATION_REQUIRED =
  "Short intake links are not available yet — apply migration-010-intake-links.sql.";

export function generateCode(bytes: number = CODE_ENTROPY_BYTES): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Canonical form for hashing and comparison.
 *
 * Whitespace only. Codes are case sensitive and `-`/`_` carry meaning, so
 * this deliberately does NOT lower-case and does NOT strip punctuation —
 * doing either would map distinct codes onto the same hash and silently
 * widen the keyspace collision surface. A code that arrives mangled is
 * rejected by `looksLikeCode()`, which is the honest answer.
 */
export function normalizeCode(raw: string): string {
  return (raw ?? "").replace(/\s+/g, "");
}

/** Shape check before touching the database. Cheap rejection of junk. */
export function looksLikeCode(raw: string): boolean {
  const normalized = normalizeCode(raw ?? "");
  return normalized.length === CODE_LENGTH && CODE_RE.test(normalized);
}

export function hashCode(raw: string): string {
  return crypto.createHash("sha256").update(normalizeCode(raw), "utf8").digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════

export type CreateLinkResult =
  | { ok: true; code: string; link: IntakeLinkRow }
  | { ok: false; error: string; migrationMissing?: boolean };

/**
 * Mint one link. The returned `code` is the caller's copy to hand to the
 * operator; an encrypted copy is stored so an admin can retrieve the same
 * URL later without replacing the link.
 *
 * The row id is generated here rather than by the column default,
 * because the ciphertext's AAD is bound to it — we have to know the id
 * before we can encrypt.
 *
 * Encryption is best-effort by design: with no key configured the link is
 * still minted, hash-only, exactly as it would have been before this
 * feature existed. Refusing to mint would take away a working capability
 * in order to protect a convenience.
 */
export async function createLink(opts: {
  restaurantId: string;
  createdBy: string;
  ttlDays?: number;
}): Promise<CreateLinkResult> {
  const ttlDays = opts.ttlDays ?? INTAKE_LINK_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const canEncrypt = isLinkCryptoConfigured();

  // A collision at 128 bits is not a real event, but the unique index
  // makes it a hard error rather than a silent overwrite, so retry.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateCode();
    const id = crypto.randomUUID();
    const codeHash = hashCode(code);

    const base = {
      id,
      restaurant_id: opts.restaurantId,
      code_hash: codeHash,
      code_prefix: code.slice(0, CODE_PREFIX_LENGTH),
      expires_at: expiresAt.toISOString(),
      created_by: opts.createdBy,
    };

    let cipher: { code_encrypted: string; code_enc_version: number } | null = null;
    if (canEncrypt && cipherColumnsPresent !== false) {
      try {
        cipher = {
          code_encrypted: encryptCode(code, {
            id,
            restaurantId: opts.restaurantId,
            codeHash,
          }),
          code_enc_version: ENVELOPE_VERSION,
        };
      } catch (err) {
        // A misconfigured key must not cost the operator their link.
        console.error(
          "[intake/links] encryption unavailable, storing hash only:",
          err instanceof Error ? err.message : "unknown error",
        );
      }
    }

    let { data, error } = await adminDb
      .from("intake_links")
      .insert(cipher ? { ...base, ...cipher } : base)
      .select(selectCols())
      .single();

    // migration-011 not applied yet → retry without the new columns.
    if (error && noteMissingCipherColumns(error)) {
      ({ data, error } = await adminDb
        .from("intake_links")
        .insert(base)
        .select(LINK_BASE_COLS)
        .single());
    }

    if (!error && data) {
      return { ok: true, code, link: data as unknown as IntakeLinkRow };
    }
    if (error && isMissingLinksTable(error)) {
      return { ok: false, error: LINKS_MIGRATION_REQUIRED, migrationMissing: true };
    }
    if (error?.code !== "23505") {
      console.error("[intake/links] createLink failed:", error?.message);
      return { ok: false, error: "Could not create the intake link" };
    }
    // 23505 → astronomically unlikely hash collision; try a new code.
  }

  return { ok: false, error: "Could not create the intake link" };
}

// ═══════════════════════════════════════════════════════════════════════
// RESOLVE
// ═══════════════════════════════════════════════════════════════════════

export type LinkResolution =
  | { ok: true; link: IntakeLinkRow }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "unavailable" };

/**
 * Resolve a code to its link row, re-checking revocation and expiry.
 *
 * Both are checked HERE rather than in the query, so the reason is
 * available to the caller for logging. Callers still show one neutral
 * message to the visitor — distinguishing "revoked" from "never existed"
 * would tell someone probing codes that they had found a real one.
 */
export async function resolveCode(rawCode: string): Promise<LinkResolution> {
  if (!looksLikeCode(rawCode)) return { ok: false, reason: "not_found" };

  let { data, error } = await adminDb
    .from("intake_links")
    .select(selectCols())
    .eq("code_hash", hashCode(rawCode))
    .maybeSingle();

  if (error && noteMissingCipherColumns(error)) {
    ({ data, error } = await adminDb
      .from("intake_links")
      .select(LINK_BASE_COLS)
      .eq("code_hash", hashCode(rawCode))
      .maybeSingle());
  }

  if (error) {
    if (isMissingLinksTable(error)) return { ok: false, reason: "unavailable" };
    console.error("[intake/links] resolveCode failed:", error.message);
    return { ok: false, reason: "not_found" };
  }
  if (!data) return { ok: false, reason: "not_found" };

  const link = data as unknown as IntakeLinkRow;
  if (link.revoked_at) return { ok: false, reason: "revoked" };
  if (new Date(link.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, link };
}

/** Throttle window for the "was this link opened?" signal. */
const USE_STAMP_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Record that a link was used, at most once every few minutes.
 *
 * Deliberately fire-and-forget: this is an operator convenience, and a
 * failed bookkeeping write must never break a restaurant's submission.
 * The throttle is in the WHERE clause, so it costs one UPDATE and no
 * extra read.
 */
export async function touchLink(linkId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - USE_STAMP_THROTTLE_MS).toISOString();
    await adminDb
      .from("intake_links")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", linkId)
      .or(`last_used_at.is.null,last_used_at.lt.${cutoff}`);
  } catch {
    /* bookkeeping only */
  }
}

/** Count a completed submission against the link that produced it. */
export async function countSubmission(linkId: string, currentCount: number): Promise<void> {
  try {
    await adminDb
      .from("intake_links")
      .update({ use_count: currentCount + 1, last_used_at: new Date().toISOString() })
      .eq("id", linkId);
  } catch {
    /* bookkeeping only */
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LIST / REVOKE / REPLACE
// ═══════════════════════════════════════════════════════════════════════

export type LinkStatus = "active" | "revoked" | "expired";

export function linkStatus(link: IntakeLinkRow, now: number = Date.now()): LinkStatus {
  if (link.revoked_at) return "revoked";
  if (new Date(link.expires_at).getTime() <= now) return "expired";
  return "active";
}

export async function listLinksForRestaurant(
  restaurantId: string,
): Promise<{ rows: IntakeLinkRow[]; migrationMissing: boolean }> {
  const query = (cols: string) =>
    adminDb
      .from("intake_links")
      .select(cols)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(20);

  let { data, error } = await query(selectCols());
  if (error && noteMissingCipherColumns(error)) {
    ({ data, error } = await query(LINK_BASE_COLS));
  }

  if (error) {
    if (isMissingLinksTable(error)) return { rows: [], migrationMissing: true };
    console.error("[intake/links] listLinksForRestaurant failed:", error.message);
    return { rows: [], migrationMissing: false };
  }
  return { rows: (data ?? []) as unknown as IntakeLinkRow[], migrationMissing: false };
}

/**
 * One link by id, scoped to its restaurant.
 *
 * `restaurantId` is REQUIRED, not optional: this is the read behind the
 * reveal path, and a link id on its own would let a malformed or
 * malicious call read a credential belonging to another partner. The
 * caller already knows which restaurant's panel it is rendering, so
 * demanding it costs nothing and closes the hole by construction.
 */
export async function getLinkById(
  linkId: string,
  restaurantId: string,
): Promise<IntakeLinkRow | null> {
  const query = (cols: string) =>
    adminDb
      .from("intake_links")
      .select(cols)
      .eq("id", linkId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

  let { data, error } = await query(selectCols());
  if (error && noteMissingCipherColumns(error)) {
    ({ data, error } = await query(LINK_BASE_COLS));
  }

  if (error) {
    if (!isMissingLinksTable(error)) {
      console.error("[intake/links] getLinkById failed:", error.message);
    }
    return null;
  }
  return (data as unknown as IntakeLinkRow | null) ?? null;
}

/** Whether this row could be re-shown to an operator right now. */
export function canRevealLink(link: IntakeLinkRow, now: number = Date.now()): boolean {
  return (
    linkStatus(link, now) === "active" &&
    Boolean(link.code_encrypted) &&
    isLinkCryptoConfigured()
  );
}

export type RevealReason =
  | "not_found"
  | "revoked"
  | "expired"
  | "legacy_no_ciphertext"
  | "key_unavailable"
  | "undecryptable";

export type RevealResult =
  | { ok: true; code: string; link: IntakeLinkRow }
  | { ok: false; reason: RevealReason };

/**
 * Recover the plaintext code for one active link.
 *
 * Re-checks status HERE rather than trusting the caller, so a revoked or
 * expired link can never be handed back even if Studio's list is stale —
 * the operator's browser could be showing a row that was revoked from
 * another tab a second ago.
 *
 * The reasons are distinguished for the OPERATOR, who is already
 * authenticated and already knows this link exists. That is the opposite
 * of the visitor-facing resolver, which collapses every failure into one
 * neutral message so a prober learns nothing.
 */
export async function revealLinkCode(
  linkId: string,
  restaurantId: string,
): Promise<RevealResult> {
  const link = await getLinkById(linkId, restaurantId);
  if (!link) return { ok: false, reason: "not_found" };

  const status = linkStatus(link);
  if (status === "revoked") return { ok: false, reason: "revoked" };
  if (status === "expired") return { ok: false, reason: "expired" };

  if (!link.code_encrypted) return { ok: false, reason: "legacy_no_ciphertext" };
  if (!isLinkCryptoConfigured()) return { ok: false, reason: "key_unavailable" };

  const code = decryptCode(link.code_encrypted, {
    id: link.id,
    restaurantId: link.restaurant_id,
    codeHash: link.code_hash,
  });
  if (!code) return { ok: false, reason: "undecryptable" };

  // Belt and braces: the stored ciphertext must decrypt to a code whose
  // hash is the one this row is indexed under. If it does not, something
  // wrote a mismatched pair and handing this out would send the partner
  // to a dead or — worse — someone else's link.
  if (hashCode(code) !== link.code_hash) {
    console.error("[intake/links] ciphertext/hash mismatch on link", link.id);
    return { ok: false, reason: "undecryptable" };
  }

  return { ok: true, code, link };
}

export type RevokeResult = { ok: true; revoked: number } | { ok: false; error: string };

/**
 * Revoke one link. Idempotent: revoking an already-revoked link reports
 * zero rows changed rather than failing, and never rewrites the original
 * revocation's author or timestamp.
 */
export async function revokeLink(opts: {
  linkId: string;
  revokedBy: string;
  reason?: string | null;
  /** Guard so an operator cannot revoke a link belonging to another partner. */
  restaurantId?: string;
}): Promise<RevokeResult> {
  let query = adminDb
    .from("intake_links")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: opts.revokedBy,
      revoke_reason: opts.reason ?? null,
    })
    .eq("id", opts.linkId)
    .is("revoked_at", null);

  if (opts.restaurantId) query = query.eq("restaurant_id", opts.restaurantId);

  const { data, error } = await query.select("id");

  if (error) {
    if (isMissingLinksTable(error)) return { ok: false, error: LINKS_MIGRATION_REQUIRED };
    console.error("[intake/links] revokeLink failed:", error.message);
    return { ok: false, error: "Could not revoke that link" };
  }
  return { ok: true, revoked: (data ?? []).length };
}

/** Revoke every live link for a restaurant. Returns how many were closed. */
export async function revokeAllForRestaurant(opts: {
  restaurantId: string;
  revokedBy: string;
  reason?: string | null;
}): Promise<RevokeResult> {
  const { data, error } = await adminDb
    .from("intake_links")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: opts.revokedBy,
      revoke_reason: opts.reason ?? null,
    })
    .eq("restaurant_id", opts.restaurantId)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    if (isMissingLinksTable(error)) return { ok: false, error: LINKS_MIGRATION_REQUIRED };
    console.error("[intake/links] revokeAllForRestaurant failed:", error.message);
    return { ok: false, error: "Could not revoke the existing links" };
  }
  return { ok: true, revoked: (data ?? []).length };
}

/** Point a superseded link at the one that replaced it. Bookkeeping only. */
export async function markReplacedBy(oldLinkIds: string[], newLinkId: string): Promise<void> {
  if (oldLinkIds.length === 0) return;
  try {
    await adminDb
      .from("intake_links")
      .update({ replaced_by: newLinkId })
      .in("id", oldLinkIds);
  } catch {
    /* bookkeeping only */
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LEGACY JWT CUTOFF
// ═══════════════════════════════════════════════════════════════════════
//
// A signed JWT carries its own authority, so there is no row to revoke.
// "Revoke all" and "Replace" would therefore be a lie for any partner
// still holding one: their short links die, their JWT keeps working.
//
// The fix is a per-restaurant cutoff instant. Any legacy token whose
// `iat` is at or before the cutoff is refused, which lets a single
// operator action close BOTH credential families at once. A token with
// no `iat` is also refused once a cutoff exists — we cannot date it, so
// we cannot prove it predates the revocation.
//
// This is a bridge, not a permanent mechanism: it becomes dead weight
// once INTAKE_ALLOW_LEGACY_JWT is turned off globally and the table can
// be dropped with the legacy route.

export async function setLegacyCutoff(opts: {
  restaurantId: string;
  setBy: string;
  at?: Date;
}): Promise<boolean> {
  const at = (opts.at ?? new Date()).toISOString();
  const { error } = await adminDb
    .from("intake_legacy_cutoffs")
    .upsert(
      { restaurant_id: opts.restaurantId, cutoff_at: at, set_by: opts.setBy },
      { onConflict: "restaurant_id" },
    );
  if (error) {
    if (isMissingLinksTable(error)) return false;
    console.error("[intake/links] setLegacyCutoff failed:", error.message);
    return false;
  }
  return true;
}

/**
 * The cutoff for a restaurant, or null if none has been set.
 *
 * A read failure returns `null` rather than throwing. That is the safe
 * direction ONLY because the caller pairs it with the global
 * INTAKE_ALLOW_LEGACY_JWT switch: if this table is unavailable the
 * operator can still close every legacy token at once.
 */
export async function getLegacyCutoff(restaurantId: string): Promise<Date | null> {
  const { data, error } = await adminDb
    .from("intake_legacy_cutoffs")
    .select("cutoff_at")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error || !data) return null;
  const at = (data as { cutoff_at: string }).cutoff_at;
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * True when a legacy token issued at `issuedAt` has been revoked for this
 * restaurant. A token we cannot date is treated as revoked once any
 * cutoff exists.
 */
export function isLegacyTokenCutOff(
  issuedAt: Date | null,
  cutoff: Date | null,
): boolean {
  if (!cutoff) return false;
  if (!issuedAt) return true;
  return issuedAt.getTime() <= cutoff.getTime();
}
