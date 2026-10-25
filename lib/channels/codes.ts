import { slugify, resolveSlugCollision } from "@/lib/slug";
import { normalizeTag, TAG_MAX_LENGTH } from "@/lib/attribution/tag";

/**
 * Turning a channel's display name into its code.
 *
 * The code is what goes in `?tag=` and what lands in `orders.tag`. It is
 * generated once, from the name the operator typed, and then never
 * changes — renaming a channel edits its label and leaves the code
 * alone. That is the whole reason this is a separate, pure module: the
 * generation rule has to be testable in isolation, because getting it
 * wrong later would detach live links from their orders.
 *
 * The operator never edits a URL parameter by hand. They type "Frisco
 * WhatsApp"; this produces `frisco-whatsapp`.
 */

/** Longest code we will generate. Matches the tag normalizer's bound. */
export const CODE_MAX_LENGTH = TAG_MAX_LENGTH;

/** Used when a label slugifies to nothing at all (e.g. "日本語", "!!!"). */
export const CODE_FALLBACK_PREFIX = "channel";

/**
 * Slugify a label into a candidate code, without collision handling.
 *
 * Reuses `lib/slug.ts` — the same slugifier behind drop ids and
 * restaurant slugs — so there is one definition of "turn text into a
 * url-safe token" in the codebase rather than three.
 *
 * `slugify` emits `[a-z0-9-]`, a strict subset of the tag alphabet
 * `[a-z0-9_-]`, so anything it produces is already acceptable to
 * `normalizeTag`. The two things it can produce that are NOT acceptable
 * are an empty string and something longer than the bound; both are
 * handled here.
 *
 * Truncation trims back to a word boundary where one is nearby, so a
 * long name yields `frisco-whatsapp-community` rather than a code cut
 * mid-word.
 */
export function codeCandidateFromLabel(label: string): string {
  const slug = slugify(label ?? "");
  if (!slug) return CODE_FALLBACK_PREFIX;
  if (slug.length <= CODE_MAX_LENGTH) return slug;

  const cut = slug.slice(0, CODE_MAX_LENGTH);
  const lastDash = cut.lastIndexOf("-");
  // Only fall back to the word boundary if it leaves a usable code.
  const trimmed = lastDash >= CODE_MAX_LENGTH / 2 ? cut.slice(0, lastDash) : cut;
  return trimmed.replace(/-+$/, "") || CODE_FALLBACK_PREFIX;
}

/**
 * The code for a new channel: a candidate from the label, made unique
 * against the codes already taken.
 *
 * Collisions resolve deterministically — `ramesh`, `ramesh-2`,
 * `ramesh-3` — via the same resolver the restaurant slugs use. No random
 * suffix, so the same inputs always give the same answer and a test can
 * assert it.
 *
 * The suffix can push a maximum-length candidate over the bound, so the
 * base is shortened first to leave room. Returns null only if the result
 * somehow fails the tag normalizer, which the caller must treat as a
 * refusal rather than storing something the resolver would later reject.
 */
export function generateChannelCode(label: string, taken: Iterable<string>): string | null {
  const takenSet = new Set(Array.from(taken, (c) => c.toLowerCase()));
  const candidate = codeCandidateFromLabel(label);

  // Leave headroom for a "-NN" suffix when the candidate is already long
  // and contested. 4 characters covers collisions up to -999.
  const base =
    takenSet.has(candidate) && candidate.length > CODE_MAX_LENGTH - 4
      ? candidate.slice(0, CODE_MAX_LENGTH - 4).replace(/-+$/, "")
      : candidate;

  const resolved = resolveSlugCollision(base || CODE_FALLBACK_PREFIX, takenSet);

  // Final gate: whatever we hand back must survive the SAME normalizer
  // the drop page, the checkout API and the webhook each apply. A code
  // that normalizes to anything else would produce links that attribute
  // to a different tag than the registry believes.
  return normalizeTag(resolved) === resolved ? resolved : null;
}

/**
 * Build the shareable URL for a drop and a channel code.
 *
 * `origin` is the configured canonical origin, passed in rather than
 * read here so this stays pure and so the caller cannot accidentally
 * build a link against whatever host the operator's browser happens to
 * be on.
 *
 * Deliberately NOT using `appendTag` from lib/attribution: that helper
 * takes an app-relative path, and a shareable link has to be absolute.
 * The query-building rule is identical and asserted against `appendTag`
 * in the tests.
 */
export function shareUrl(origin: string, dropId: string, code: string | null): string {
  const base = `${(origin ?? "").replace(/\/+$/, "")}/drop/${encodeURIComponent(dropId)}`;
  const normalized = normalizeTag(code);
  return normalized ? `${base}?tag=${encodeURIComponent(normalized)}` : base;
}
