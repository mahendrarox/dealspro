import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropItem } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ order: null });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("drop_item_id, drop_title, restaurant_name, price_paid, qr_token, status, redemption_status")
    .eq("stripe_session_id", sessionId)
    .single();

  if (!order?.qr_token) {
    return NextResponse.json({ order: null });
  }

  const dropItem = order.drop_item_id ? getDropItem(order.drop_item_id) : null;

  const dealCardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${order.qr_token}`;
  const qrDataUrl = await QRCode.toDataURL(dealCardUrl, {
    width: 200,
    margin: 2,
    color: { dark: "#18181B", light: "#FFFFFF" },
  });

  return NextResponse.json({ order, dropItem, qrDataUrl, dealCardUrl });
}
