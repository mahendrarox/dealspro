import { adminDb } from "@/lib/supabase-admin";
import { getActiveDropsFromDb } from "@/lib/drops/db";
import { getSpotsInfo } from "@/lib/spots";
import { isClaimable } from "@/lib/drops";
import type { DropItem } from "@/lib/drops/types";

/**
 * Restaurant resolver data layer for the public /r/[slug] smart URL.
 *
 * Deliberately built on the LIST read path (`getActiveDropsFromDb`) +
 * the canonical `isClaimable` predicate. It must NEVER use
 * `getDropByIdForServer`, which applies neither the `archived_at` nor the
 * `is_active` filter and would surface archived/inactive drops.
 */

export type ResolvedRestaurant = {
  id: string;
  name: string;
  slug: string;
  city: string;
};

/**
 * Look up an ACTIVE restaurant by its stable slug. Returns null when no
 * row matches or the restaurant is inactive — the route turns that into a
 * 404 (the capture state is reserved for a VALID restaurant with 0
 * claimable drops, never for an unknown slug).
 */
export async function getRestaurantBySlug(
  slug: string,
): Promise<ResolvedRestaurant | null> {
  const { data, error } = await adminDb
    .from("restaurants")
    .select("id, name, slug, city")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error(`[restaurants/db] getRestaurantBySlug(${slug}) error:`, error.message);
    return null;
  }
  return (data as ResolvedRestaurant | null) ?? null;
}

/**
 * Claimable, non-archived drops for a restaurant.
 *
 * Composition (matches the reviewed plan):
 *   DB layer    → getActiveDropsFromDb({ restaurantId })
 *                 (is_active = true AND archived_at IS NULL AND restaurant_id = ?)
 *   helper layer→ isClaimable(drop, spotsRemaining) per drop
 *                 (status live + ordering-open + spots remaining > 0)
 */
export async function getClaimableDropsForRestaurant(
  restaurantId: string,
): Promise<DropItem[]> {
  const drops = await getActiveDropsFromDb({ restaurantId });
  if (drops.length === 0) return [];

  // Resolve spots per drop (small N: one restaurant's live drops). The
  // total_spots override skips a redundant drop_items read per call.
  const withSpots = await Promise.all(
    drops.map(async (d) => {
      const { remaining } = await getSpotsInfo(d.id, d.total_spots);
      return { drop: d, remaining };
    }),
  );

  return withSpots
    .filter(({ drop, remaining }) => isClaimable(drop, remaining))
    .map(({ drop }) => drop);
}
