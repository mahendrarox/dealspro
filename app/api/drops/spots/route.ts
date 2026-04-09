import { NextResponse } from "next/server";
import { DROP_ITEMS } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/drops/spots
 * Returns { [drop_id]: spots_remaining } for all drops in one batch query.
 */
export async function GET() {
  const result: Record<string, number> = {};

  // Initialize with full spots (optimistic default)
  for (const item of DROP_ITEMS) {
    result[item.id] = item.total_spots;
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("drop_item_id, quantity")
      .eq("status", "paid");

    if (error) {
      console.error("[drops/spots] Error fetching orders:", error);
      return NextResponse.json(result);
    }

    // Sum quantities per drop
    const claimed: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.drop_item_id) {
        claimed[row.drop_item_id] =
          (claimed[row.drop_item_id] || 0) + (row.quantity ?? 1);
      }
    }

    // Compute remaining
    for (const item of DROP_ITEMS) {
      const c = claimed[item.id] || 0;
      result[item.id] = Math.max(0, item.total_spots - c);
    }
  } catch (err) {
    console.error("[drops/spots] Unexpected error:", err);
    // Return optimistic defaults on failure
  }

  return NextResponse.json(result);
}
