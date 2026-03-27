import { supabase } from "@/lib/supabase";
import { DROP_ITEMS, getDropItem } from "@/lib/constants";

export interface SpotsInfo {
  remaining: number;
  claimed: number;
}

/** Get spots info for a single drop item */
export async function getSpotsInfo(dropItemId: string): Promise<SpotsInfo> {
  const item = getDropItem(dropItemId);
  if (!item) return { remaining: 0, claimed: 0 };

  const { count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("drop_item_id", dropItemId)
    .eq("status", "paid");

  if (error) {
    console.error("[Spots] Error counting orders for", dropItemId, error);
    return { remaining: item.total_spots, claimed: 0 };
  }

  const claimed = count ?? 0;
  return {
    remaining: Math.max(0, item.total_spots - claimed),
    claimed,
  };
}

/** Get spots info for all drop items in one go */
export async function getAllSpotsInfo(): Promise<Record<string, SpotsInfo>> {
  const result: Record<string, SpotsInfo> = {};

  // Initialize with full spots
  for (const item of DROP_ITEMS) {
    result[item.id] = { remaining: item.total_spots, claimed: 0 };
  }

  // Fetch all paid orders grouped by drop_item_id
  const { data, error } = await supabase
    .from("orders")
    .select("drop_item_id")
    .eq("status", "paid");

  if (error) {
    console.error("[Spots] Error fetching orders:", error);
    return result;
  }

  // Count per item
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.drop_item_id) {
      counts[row.drop_item_id] = (counts[row.drop_item_id] || 0) + 1;
    }
  }

  // Apply counts
  for (const item of DROP_ITEMS) {
    const claimed = counts[item.id] || 0;
    result[item.id] = {
      remaining: Math.max(0, item.total_spots - claimed),
      claimed,
    };
  }

  return result;
}
