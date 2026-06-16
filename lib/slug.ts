/**
 * Canonical slug utilities — single source of truth.
 *
 * `slugify()` originated in `app/admin/drops/form-utils.ts` (drop-id
 * generation). It is hoisted here so the restaurant slug column, the
 * backfill script, the Studio create action, and the `/r/[slug]` resolver
 * all share ONE implementation and can never drift. `form-utils.ts`
 * re-exports this, so existing drop-id behavior is unchanged.
 */

/** Slugify a string: lowercase, spaces→dashes, strip non-[a-z0-9-]. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Deterministic collision resolver. Given a base slug and the set of
 * slugs already taken, returns the first free of: base, base-2, base-3, …
 *
 * No random suffixes — the result is a pure function of (base, taken),
 * so the runtime create path and the one-off backfill agree exactly.
 */
export function resolveSlugCollision(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
