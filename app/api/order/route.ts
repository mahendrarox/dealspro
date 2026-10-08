import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getDropByIdForServer } from "@/lib/drops/db";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Explicit column list, not `*`. This row is returned verbatim to the
  // browser below, so every column added to `orders` would otherwise be
  // published to anyone holding a qr_token. `tag` is channel attribution —
  // internal only — and is deliberately absent. The list matches the
  // `Order` type the scanner renders (app/scan/page.tsx).
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, phone, drop_item_id, drop_title, restaurant_name, price_paid, quantity, status, redemption_status, qr_token, created_at, redeemed_at",
    )
    .eq("qr_token", token)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const dropItem = order.drop_item_id ? await getDropByIdForServer(order.drop_item_id) : null;

  return NextResponse.json({ order, dropItem });
}
