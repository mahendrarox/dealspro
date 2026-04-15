import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropByIdForServer } from "@/lib/drops/db";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    console.log("[poll] No session_id provided");
    return NextResponse.json({ order: null });
  }

  console.log("[poll] Querying orders with stripe_session_id:", sessionId);

  const { data: order, error } = await supabase
    .from("orders")
    .select("drop_item_id, drop_title, restaurant_name, price_paid, qr_token, status, redemption_status, quantity")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.log("[poll] Supabase error:", error.message);
    return NextResponse.json({ order: null });
  }

  if (!order?.qr_token) {
    console.log("[poll] No order found yet for session:", sessionId);
    return NextResponse.json({ order: null });
  }

  console.log("[poll] Order found:", { qr_token: order.qr_token, status: order.status });

  const dropItem = order.drop_item_id ? await getDropByIdForServer(order.drop_item_id) : null;

  const dealCardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${order.qr_token}`;
  const qrDataUrl = await QRCode.toDataURL(dealCardUrl, {
    width: 200,
    margin: 2,
    color: { dark: "#18181B", light: "#FFFFFF" },
  });

  return NextResponse.json({ order, dropItem, qrDataUrl, dealCardUrl });
}
