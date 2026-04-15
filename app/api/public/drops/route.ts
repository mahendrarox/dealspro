import { NextResponse } from "next/server";
import { getActiveDropsFromDb } from "@/lib/drops/db";

export const dynamic = "force-dynamic";

/**
 * Public API: list active drops.
 * Returns only rows with is_active = true, ordered by hero DESC, priority ASC, created DESC.
 * Response shape mirrors the legacy DropItem so existing clients keep working.
 */
export async function GET() {
  try {
    const drops = await getActiveDropsFromDb();
    return NextResponse.json({ drops });
  } catch (err) {
    console.error("[api/public/drops]", err);
    return NextResponse.json({ drops: [] }, { status: 200 });
  }
}
