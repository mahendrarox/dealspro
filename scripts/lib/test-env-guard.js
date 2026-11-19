#!/usr/bin/env node
/**
 * Fail-closed test-environment guard.
 *
 * WHY THIS EXISTS
 * scripts/test-regression.js performs 92 write operations including 54
 * deletes against whatever `NEXT_PUBLIC_SUPABASE_URL` happens to point at.
 * Its own header claimed "Production-safe: uses only test data, always
 * cleans up". That is a statement about intent, not a control: one wrong
 * environment variable and the suite deletes real orders, drops, customers
 * and restaurants. Nothing stopped it.
 *
 * THE RULE: refuse unless the target is AFFIRMATIVELY PROVEN to be a
 * dedicated test environment. Absence of proof is refusal. There is no
 * path through this module that reaches "allow" by default, by omission,
 * or by an error being swallowed.
 *
 * SIGNALS DELIBERATELY NOT TRUSTED
 *   - NODE_ENV. Unset in most shells, trivially inherited, says nothing
 *     about which database a URL points to.
 *   - Any variable whose VALUE is "test". Self-asserted, unverifiable, and
 *     copied along with the rest of an .env file.
 *   - A substring of the URL ("staging", "test", "dev"). A production
 *     project can be named anything; `test-prod-restore.supabase.co` would
 *     pass a substring check while being a production clone.
 * Each of these can be true while the target is production, so none of
 * them is sufficient and none is consulted.
 *
 * SIGNALS REQUIRED — four, independent, ALL must hold
 *   1. ALLOWLIST   An explicit allowlist of permitted target identities,
 *                  supplied out of band. Exact match on a parsed identity,
 *                  never a substring.
 *   2. URL IDENTITY  The Supabase project ref parsed from the URL's
 *                  hostname (or `local:<host>:<port>` for a loopback
 *                  cluster) — structure, not text search.
 *   3. DEDICATED CREDENTIAL  A separate variable, SUPABASE_TEST_SERVICE_ROLE_KEY.
 *                  The production-named SUPABASE_SERVICE_ROLE_KEY is never
 *                  read here, so a prod key cannot be picked up by accident,
 *                  and the credential's OWN `ref` claim must agree with the
 *                  URL identity. A production key aimed at a test URL fails
 *                  on that disagreement.
 *   4. LIVE MARKER  A sentinel row, read from the target itself, declaring
 *                  it non-production and naming the same identity. This is
 *                  the authoritative gate: production does not have the
 *                  marker and must never be given one.
 *
 * If the marker cannot be read — table absent, network down, permission
 * denied, timeout — verification is UNAVAILABLE and the guard REFUSES.
 * Unavailable is not inconclusive; it is a no.
 */

"use strict";

/** Variable holding the dedicated test credential. Never the prod name. */
const TEST_KEY_VAR = "SUPABASE_TEST_SERVICE_ROLE_KEY";
/** Variable holding the out-of-band allowlist, comma-separated identities. */
const ALLOWLIST_VAR = "DEALSPRO_TEST_TARGET_ALLOWLIST";
/** Sentinel table read (never written) to prove the target is a test env. */
const MARKER_TABLE = "dealspro_test_marker";

class TestEnvironmentRefused extends Error {
  constructor(reason, detail) {
    super(`REFUSED: ${reason}${detail ? ` — ${detail}` : ""}`);
    this.name = "TestEnvironmentRefused";
    this.reason = reason;
  }
}

/**
 * Parse a Supabase URL into a stable identity string.
 *
 * Returns `<ref>` for `https://<ref>.supabase.co`, or `local:<host>:<port>`
 * for a loopback cluster. Anything else is unidentifiable and therefore
 * refused by the caller — an unrecognised host shape is exactly the case
 * where guessing is most dangerous.
 */
function parseTargetIdentity(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") return null;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return `local:${host}:${port}`;
  }
  // Exact suffix match on the registrable domain — not `includes()`.
  const labels = host.split(".");
  if (labels.length >= 3 && labels.slice(1).join(".") === "supabase.co") {
    const ref = labels[0];
    return /^[a-z0-9]{8,}$/.test(ref) ? ref : null;
  }
  return null;
}

/**
 * Read the `ref` claim a Supabase key makes about itself.
 *
 * The signature is NOT verified: this is an accident-prevention
 * cross-check, not a security boundary. A forged key would pass here and
 * be caught by the live marker, which is the authoritative gate. Returns
 * null when the key carries no ref claim.
 */
function credentialRefClaim(key) {
  if (typeof key !== "string") return null;
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const ref = JSON.parse(json).ref;
    return typeof ref === "string" && ref ? ref : null;
  } catch {
    return null;
  }
}

function parseAllowlist(raw) {
  if (typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Everything checkable WITHOUT touching the database.
 *
 * Pure: all inputs are arguments, so every rejection path is testable with
 * no database, no network and no credentials. Returns the proven identity
 * on success; throws TestEnvironmentRefused otherwise.
 */
function verifyStatic(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env[TEST_KEY_VAR];
  const allowlist = parseAllowlist(env[ALLOWLIST_VAR]);

  if (!url) throw new TestEnvironmentRefused("no target URL configured");
  if (!key) {
    throw new TestEnvironmentRefused(
      "no dedicated test credential",
      `set ${TEST_KEY_VAR}; the production SUPABASE_SERVICE_ROLE_KEY is deliberately not read`,
    );
  }
  if (allowlist.length === 0) {
    throw new TestEnvironmentRefused(
      "no allowlist configured",
      `set ${ALLOWLIST_VAR} to the permitted test target identity`,
    );
  }

  const identity = parseTargetIdentity(url);
  if (!identity) {
    throw new TestEnvironmentRefused(
      "target identity could not be parsed",
      "host is neither a loopback cluster nor an <ref>.supabase.co project",
    );
  }
  if (!allowlist.includes(identity)) {
    throw new TestEnvironmentRefused(
      "target is not on the allowlist",
      `identity ${identity} is not among the permitted targets`,
    );
  }

  const claimed = credentialRefClaim(key);
  const isLocal = identity.startsWith("local:");
  if (!isLocal && !claimed) {
    throw new TestEnvironmentRefused(
      "credential makes no project claim",
      "a Supabase project key must carry a ref claim; refusing to assume",
    );
  }
  if (claimed && claimed !== identity) {
    throw new TestEnvironmentRefused(
      "credential belongs to a different project",
      `URL identity ${identity} but credential claims ${claimed}`,
    );
  }
  return identity;
}

/**
 * Live confirmation: the target declares itself non-production.
 *
 * `probe` receives the marker table name and returns
 * `{ ok, row }` or `{ ok: false, error }`. Injected so this is testable
 * without a database. Any failure — thrown, not-ok, absent row, wrong
 * identity, or is_production anything other than exactly false — refuses.
 */
async function verifyLive(identity, probe) {
  if (typeof probe !== "function") {
    throw new TestEnvironmentRefused("no way to verify the live target");
  }
  let result;
  try {
    result = await probe(MARKER_TABLE);
  } catch (err) {
    throw new TestEnvironmentRefused(
      "live verification unavailable",
      err && err.message ? err.message : "probe threw",
    );
  }
  if (!result || result.ok !== true) {
    throw new TestEnvironmentRefused(
      "live verification unavailable",
      (result && result.error) || `could not read ${MARKER_TABLE}`,
    );
  }
  const row = result.row;
  if (!row) {
    throw new TestEnvironmentRefused(
      "target carries no test marker",
      `${MARKER_TABLE} is empty; production will never have this row`,
    );
  }
  if (row.is_production !== false) {
    throw new TestEnvironmentRefused(
      "target marker does not declare a test environment",
      `is_production=${JSON.stringify(row.is_production)}; only exactly false is accepted`,
    );
  }
  if (row.target_identity !== identity) {
    throw new TestEnvironmentRefused(
      "marker identity does not match the target",
      `connected to ${identity} but its marker names ${JSON.stringify(row.target_identity)}`,
    );
  }
  return identity;
}

/**
 * The gate. Static checks first (cheap, no network), then live.
 * Returns the proven identity. Throws on anything else.
 */
async function assertTestEnvironment(env, probe) {
  const identity = verifyStatic(env);
  await verifyLive(identity, probe);
  return identity;
}

/** Build a probe bound to a Supabase client. Read-only: select, never write. */
function supabaseProbe(client) {
  return async (table) => {
    const { data, error } = await client
      .from(table)
      .select("target_identity, is_production")
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, row: data || null };
  };
}

module.exports = {
  TestEnvironmentRefused,
  TEST_KEY_VAR,
  ALLOWLIST_VAR,
  MARKER_TABLE,
  parseTargetIdentity,
  credentialRefClaim,
  verifyStatic,
  verifyLive,
  assertTestEnvironment,
  supabaseProbe,
};
