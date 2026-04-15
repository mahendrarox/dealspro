import { supabase } from "@/lib/supabase";
import { adminDb } from "@/lib/supabase-admin";

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
 * The database is the ONLY source of truth. `totalSpotsOverride` lets
 * callers that already loaded the drop from DB skip a redundant query;
 * otherwise we fetch total_spots from `drop_items`.
 */
export async function getSpotsInfo(
  dropItemId: string,
  totalSpotsOverride?: number,
): Promise<SpotsInfo> {
  let totalSpots: number;
  if (typeof totalSpotsOverride === "number") {
    totalSpots = totalSpotsOverride;
  } else {
    const { data: row, error: rowErr } = await adminDb
      .from("drop_items")
      .select("total_spots")
      .eq("id", dropItemId)
      .maybeSingle();
    if (rowErr || !row) return { remaining: 0, claimed: 0 };
    totalSpots = row.total_spots;
  }

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
 *
 * Reads drop_items from DB (no constants fallback), then sums paid
 * order quantities per drop.
 */
export async function getAllSpotsInfo(): Promise<Record<string, SpotsInfo>> {
  const result: Record<string, SpotsInfo> = {};

  const { data: drops, error: dropErr } = await adminDb
    .from("drop_items")
    .select("id, total_spots");

  if (dropErr || !drops) {
    console.error("[Spots] Error fetching drop_items:", dropErr?.message);
    return result;
  }

  for (const d of drops as { id: string; total_spots: number }[]) {
    result[d.id] = { remaining: d.total_spots, claimed: 0 };
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

  for (const id of Object.keys(result)) {
    const c = claimed[id] ?? 0;
    result[id] = {
      remaining: Math.max(0, result[id].remaining - c),
      claimed: c,
    };
  }

  return result;
}
