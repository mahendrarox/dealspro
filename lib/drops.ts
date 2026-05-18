import type { DropItem } from "@/lib/drops/types";

/**
 * Returns the purchase cutoff time (ms since epoch) for a drop.
 * Purchase window closes at the drop's `start_time_iso` instant.
 *
 * Reads from the UTC instant — the legacy `date` / `start_time` string
 * fields are server-local wall-clock projections and were producing
 * Infinity-ish drift when the runtime TZ differed from the audience TZ.
 */
export function getPurchaseCutoff(drop: DropItem): number {
  if (!drop.start_time_iso) return Infinity;
  const t = new Date(drop.start_time_iso).getTime();
  return Number.isFinite(t) ? t : Infinity;
}

/**
 * A drop is active (buyable) when:
 * 1. status is "live" (or missing — treat as active)
 * 2. current time < purchase cutoff (start_time)
 * 3. spotsRemaining > 0
 */
export function isActiveDrop(
  drop: DropItem,
  spotsRemaining: number,
  now: number = Date.now(),
): boolean {
  // Status check: only "live" or missing status is considered active
  if (drop.status && drop.status !== "live") return false;

  // Time check
  if (now >= getPurchaseCutoff(drop)) return false;

  // Spots check
  if (spotsRemaining <= 0) return false;

  return true;
}

/**
 * A drop is sold-out when:
 * 1. status is "live" or missing
 * 2. current time < purchase cutoff
 * 3. spotsRemaining === 0
 */
export function isSoldOutDrop(
  drop: DropItem,
  spotsRemaining: number,
  now: number = Date.now(),
): boolean {
  if (drop.status && drop.status !== "live") return false;
  if (now >= getPurchaseCutoff(drop)) return false;
  return spotsRemaining === 0;
}

/**
 * Deterministic featured drop selection.
 *
 * Admin intent wins: if any drop in `allDrops` has `is_hero = true`, it
 * is rendered as the hero regardless of cutoff or sold-out state. The
 * DropCard CTA layer already shows the correct "Ended" / "Ordering
 * Closed" / "Sold Out" state for expired or empty drops, so an explicit
 * hero pick stays visible until the admin clears the flag.
 *
 * If no admin hero exists, fall back to auto-selection from active drops:
 *   1. Lower admin priority value wins
 *   2. Earliest purchase cutoff
 *   3. Lowest remaining spots
 *   4. Alphabetical id (tiebreaker for full determinism)
 *
 * The DB query (`getActiveDropsFromDb`) orders by hero+priority so SSR
 * shows the hero first, and `drops[0]` matches what this returns —
 * no hero-flicker on hydration.
 */
export function selectFeatured(
  allDrops: DropItem[],
  activeDrops: DropItem[],
  spotsMap: Record<string, number>,
): DropItem | null {
  // Admin override — is_hero wins regardless of cutoff/sold-out state.
  // We still respect status: "cancelled" should suppress the hero.
  const adminHero = allDrops.find(
    (d) => d.is_hero === true && (!d.status || d.status !== "cancelled"),
  );
  if (adminHero) return adminHero;

  if (activeDrops.length === 0) return null;

  const sorted = [...activeDrops].sort((a, b) => {
    // 1. Lower priority value wins (default 0 if absent)
    const prA = a.priority ?? 0;
    const prB = b.priority ?? 0;
    if (prA !== prB) return prA - prB;

    // 2. Earliest cutoff
    const cutoffA = getPurchaseCutoff(a);
    const cutoffB = getPurchaseCutoff(b);
    if (cutoffA !== cutoffB) return cutoffA - cutoffB;

    // 3. Lowest remaining spots
    const spotsA = spotsMap[a.id] ?? a.total_spots;
    const spotsB = spotsMap[b.id] ?? b.total_spots;
    if (spotsA !== spotsB) return spotsA - spotsB;

    // 4. Alphabetical id (deterministic tiebreaker)
    return String(a.id).localeCompare(String(b.id));
  });

  return sorted[0];
}

/**
 * Get remaining drops after featured is selected.
 * Safety: if filtering somehow empties the list despite multiple active drops, fall back to all.
 */
export function getRemainingDrops(
  activeDrops: DropItem[],
  featured: DropItem,
): DropItem[] {
  const remaining = activeDrops.filter(
    (d) => String(d.id) !== String(featured.id),
  );

  // Fallback safety: accept duplication over empty UI
  if (activeDrops.length > 1 && remaining.length === 0) {
    return activeDrops;
  }

  return remaining;
}
