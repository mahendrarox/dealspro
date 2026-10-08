/**
 * Channel attribution tag: `?tag=<who shared this link>`.
 *
 * ONE normalizer, used at every boundary the value crosses — the page
 * that reads the URL, the checkout API that accepts it in a body, and
 * the webhook that reads it back off Stripe metadata. Each of those is a
 * separate trust boundary (a crafted request can reach the API without
 * ever touching the page, and Stripe metadata is data we handed out and
 * got back), so each one re-normalizes rather than trusting its caller.
 *
 * NOT to be confused with any drop categorization concept. This is
 * channel attribution only: who shared the link that produced an order.
 * There is no `drop_tag` in this codebase — verified, not assumed.
 *
 * Deliberately has no dependency on `lib/intake` or anything else:
 * `scripts/test-intake.js` asserts that the customer-facing paths this
 * module is imported into never reach into the intake modules.
 */

/** Longest tag we store. Matches the CHECK the migration applies. */
export const TAG_MAX_LENGTH = 64;

/** The query-string key, in one place so the pages cannot disagree. */
export const TAG_PARAM = "tag";

/**
 * Lowercase alphanumerics, underscore and hyphen. Anchored and bounded,
 * so a 65th character is a rejection rather than a silent truncation.
 */
const TAG_RE = /^[a-z0-9_-]{1,64}$/;

/**
 * Normalize, or reject.
 *
 * trim → lowercase → validate. Case folding is the ONLY transformation:
 * nothing is stripped. `"ram esh"` becomes null rather than `"ramesh"`,
 * because silently deleting characters would merge two distinct channels
 * into one and make the resulting numbers quietly wrong — a worse outcome
 * than recording no attribution at all.
 *
 * Accepts `unknown` because every caller receives one of three untyped
 * shapes: a Next.js search param (`string | string[] | undefined`), a
 * JSON body field, or a Stripe metadata value.
 *
 * A repeated param (`?tag=a&tag=b`) arrives as an array and is rejected:
 * there is no principled way to pick one, and guessing would attribute
 * an order to a channel nobody chose.
 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const folded = raw.trim().toLowerCase();
  return TAG_RE.test(folded) ? folded : null;
}

/**
 * Append a tag to an internal path, if there is one worth appending.
 *
 * Takes an app-relative path (`/drop/abc`) and returns it unchanged when
 * the tag is null, so callers can use it unconditionally. The tag is
 * already known to match `TAG_RE` at this point — no character needing
 * escaping can survive the normalizer — but it is encoded anyway, because
 * a helper that only happens to be safe is one refactor away from not
 * being.
 */
export function appendTag(path: string, tag: string | null): string {
  if (!tag) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${TAG_PARAM}=${encodeURIComponent(tag)}`;
}

/**
 * Pull the tag out of a Next.js `searchParams` object, normalized.
 *
 * Returns null for absent, malformed, repeated and oversized values
 * alike. The caller never needs to know which.
 */
export function tagFromSearchParams(
  params: Record<string, string | string[] | undefined> | undefined,
): string | null {
  return normalizeTag(params?.[TAG_PARAM]);
}
