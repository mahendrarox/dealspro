import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropByIdForServer } from "@/lib/drops/db";
import { isRedemptionValid } from "@/lib/drops/helpers";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.json({ order: null, card: null });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.log("[poll] Supabase error:", error.message);
    return NextResponse.json({ order: null, card: null });
  }

  if (!order?.qr_token) {
    return NextResponse.json({ order: null, card: null });
  }

  const dealCardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${order.qr_token}`;
  const qrDataUrl = await QRCode.toDataURL(dealCardUrl, {
    width: 240,
    margin: 2,
    color: { dark: "#18181B", light: "#FFFFFF" },
  });

  const item = order.drop_item_id ? await getDropByIdForServer(order.drop_item_id) : null;
  const drop = item
    ? {
        title: item.title,
        restaurantName: item.restaurant_name,
        price: item.price,
        originalPrice:
          item.original_price && item.original_price > 0 ? item.original_price : null,
        date: item.date,
        startTime: item.start_time,
        endTime: item.end_time,
        address: item.address || null,
        lat: item.lat || null,
        lng: item.lng || null,
      }
    : null;

  const isRedeemed = order.redemption_status === "redeemed";
  const isExpired = item ? !isRedemptionValid(item) : false;
  const status: "active" | "redeemed" | "expired" = isRedeemed
    ? "redeemed"
    : isExpired
      ? "expired"
      : "active";

  const card = {
    orderId: order.id ?? order.qr_token,
    qrToken: order.qr_token,
    phone: order.phone ?? null,
    quantity: order.quantity ?? 1,
    pricePaid: Number(order.price_paid),
    status,
    redeemedAt: order.redeemed_at ?? null,
    qrDataUrl,
    drop,
  };

  return NextResponse.json({ card, order });
}
