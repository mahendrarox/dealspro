import { NextResponse } from "next/server";
import { DROP_ITEMS } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { adminDb } from "@/lib/supabase-admin";
import { CONFIRMED_STATUS } from "@/lib/spots";

export const dynamic = "force-dynamic";

/**
 * GET /api/drops/spots
 * Returns { [drop_id]: spots_remaining } for all drops.
 *
 * Drop totals come from `drop_items` (DB) first, with fallback to
 * constants.ts. Claimed counts sum `quantity` WHERE status = 'paid'.
 * Only CONFIRMED_STATUS orders reduce remaining spots.
 */
export async function GET() {
  const result: Record<string, number> = {};

  // Baseline: DB totals, fallback to constants
  try {
    const { data: dbRows } = await adminDb
      .from("drop_items")
      .select("id, total_spots");
    if (dbRows && dbRows.length > 0) {
      for (const row of dbRows as { id: string; total_spots: number }[]) {
        result[row.id] = row.total_spots;
      }
    }
  } catch (err) {
    console.error("[drops/spots] drop_items fetch failed, falling back:", err);
  }
  // Ensure every constants id is present (covers any DB gaps during migration)
  for (const item of DROP_ITEMS) {
    if (result[item.id] === undefined) result[item.id] = item.total_spots;
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("drop_item_id, quantity")
      .eq("status", CONFIRMED_STATUS);

    if (error) {
      console.error("[drops/spots] Error fetching orders:", error);
      return NextResponse.json(result);
    }

    const claimed: Record<string, number> = {};
    for (const row of (data ?? []) as { drop_item_id: string | null; quantity: number | null }[]) {
      if (!row.drop_item_id) continue;
      claimed[row.drop_item_id] = (claimed[row.drop_item_id] ?? 0) + (row.quantity ?? 1);
    }

    for (const id of Object.keys(result)) {
      const c = claimed[id] ?? 0;
      result[id] = Math.max(0, result[id] - c);
    }
  } catch (err) {
    console.error("[drops/spots] Unexpected error:", err);
  }

  return NextResponse.json(result);
}
