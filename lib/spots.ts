import { supabase } from "@/lib/supabase";
import { DROP_ITEMS, getDropItem } from "@/lib/constants";

/**
 * Canonical confirmed-payment status string used across the app.
 * Matches the value written by create_order_atomic RPC on successful payment.
 * Also used in admin spots computation and regression tests.
 */
export const CONFIRMED_STATUS = "paid" as const;

export interface SpotsInfo {
  remaining: number;
  claimed: number;
}

/**
 * Get spots info for a single drop item.
 *
 * Rule: spots_remaining = total_spots - SUM(quantity WHERE status = CONFIRMED_STATUS)
 * Only CONFIRMED_STATUS orders count. Pending/failed/cancelled/refunded are excluded.
 *
 * @param dropItemId - the drop id to look up
 * @param totalSpotsOverride - optional DB-provided total_spots. If omitted,
 *   falls back to the value in lib/constants.ts via getDropItem. Passing the
 *   DB value explicitly is the preferred path now that drop_items is the source of truth.
 */
export async function getSpotsInfo(
  dropItemId: string,
  totalSpotsOverride?: number,
): Promise<SpotsInfo> {
  const totalSpots = typeof totalSpotsOverride === "number"
    ? totalSpotsOverride
    : getDropItem(dropItemId)?.total_spots ?? 0;

  if (totalSpots === 0) return { remaining: 0, claimed: 0 };

  const { data, error } = await supabase
    .from("orders")
    .select("quantity")
    .eq("drop_item_id", dropItemId)
    .eq("status", CONFIRMED_STATUS);

  if (error) {
    console.error("[Spots] Error fetching orders for", dropItemId, error);
    return { remaining: totalSpots, claimed: 0 };
  }

  const claimed = (data ?? []).reduce(
    (acc: number, row: { quantity: number | null }) => acc + (row.quantity ?? 1),
    0,
  );
  return {
    remaining: Math.max(0, totalSpots - claimed),
    claimed,
  };
}

/**
 * Get spots info for all drop items in one batch query.
 * Still uses DROP_ITEMS for the initial total_spots baseline so this path
 * stays compatible during the migration window. Will be switched to the
 * drop_items table in a follow-up PR.
 */
export async function getAllSpotsInfo(): Promise<Record<string, SpotsInfo>> {
  const result: Record<string, SpotsInfo> = {};
  for (const item of DROP_ITEMS) {
    result[item.id] = { remaining: item.total_spots, claimed: 0 };
  }

  const { data, error } = await supabase
    .from("orders")
    .select("drop_item_id, quantity")
    .eq("status", CONFIRMED_STATUS);

  if (error) {
    console.error("[Spots] Error fetching orders:", error);
    return result;
  }

  const claimed: Record<string, number> = {};
  for (const row of (data ?? []) as { drop_item_id: string | null; quantity: number | null }[]) {
    if (!row.drop_item_id) continue;
    claimed[row.drop_item_id] = (claimed[row.drop_item_id] ?? 0) + (row.quantity ?? 1);
  }

  for (const item of DROP_ITEMS) {
    const c = claimed[item.id] ?? 0;
    result[item.id] = {
      remaining: Math.max(0, item.total_spots - c),
      claimed: c,
    };
  }

  return result;
}
