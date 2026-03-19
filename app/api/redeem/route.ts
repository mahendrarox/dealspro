import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("qr_token", token)
    .single();

  if (error || !order) {
    console.log("[Redeem] Order not found for token:", token);
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status === "redeemed") {
    console.log("[Redeem] Already redeemed:", token);
    return NextResponse.json({ error: "Already redeemed", order }, { status: 409 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("qr_token", token)
    .select()
    .single();

  if (updateError) {
    console.error("[Redeem] Update failed:", updateError);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  console.log("[Redeem] Redemption confirmed for token:", token);
  return NextResponse.json({ success: true, order: updated });
}
