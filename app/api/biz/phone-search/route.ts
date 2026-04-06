import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawPhone = request.nextUrl.searchParams.get("phone");

  if (!rawPhone || !rawPhone.trim()) {
    return NextResponse.json({ orders: [] });
  }

  const phone = normalizePhone(rawPhone.trim());

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, drop_title, restaurant_name, drop_item_id, price_paid, quantity, status, redemption_status, qr_token, created_at"
    )
    .eq("phone", phone)
    .eq("status", "paid")
    .eq("redemption_status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[phone-search] Supabase error:", error.message);
    return NextResponse.json({ orders: [] });
  }

  return NextResponse.json({ orders: orders ?? [] });
}
