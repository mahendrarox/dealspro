import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getDropByIdForServer } from "@/lib/drops/db";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("qr_token", token)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const dropItem = order.drop_item_id ? await getDropByIdForServer(order.drop_item_id) : null;

  return NextResponse.json({ order, dropItem });
}
