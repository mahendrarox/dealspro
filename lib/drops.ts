import type { DropItem } from "@/lib/constants";

/**
 * Returns the purchase cutoff time (ms since epoch) for a drop.
 * Purchase window closes at `start_time` on the drop's `date`.
 * If fields are missing/invalid, returns Infinity (treat as always buyable).
 */
export function getPurchaseCutoff(drop: DropItem): number {
  try {
    if (!drop.date || !drop.start_time) return Infinity;
    const d = new Date(`${drop.date}T${drop.start_time}:00`);
    const t = d.getTime();
    return Number.isNaN(t) ? Infinity : t;
  } catch {
    return Infinity;
  }
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
 * Priority: earliest cutoff → lowest spots → ID tiebreaker
 */
export function selectFeatured(
  activeDrops: DropItem[],
  spotsMap: Record<string, number>,
): DropItem | null {
  if (activeDrops.length === 0) return null;

  const sorted = [...activeDrops].sort((a, b) => {
    const cutoffA = getPurchaseCutoff(a);
    const cutoffB = getPurchaseCutoff(b);
    if (cutoffA !== cutoffB) return cutoffA - cutoffB;

    const spotsA = spotsMap[a.id] ?? a.total_spots;
    const spotsB = spotsMap[b.id] ?? b.total_spots;
    if (spotsA !== spotsB) return spotsA - spotsB;

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
