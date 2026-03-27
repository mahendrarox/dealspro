import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { getDropItem, canPurchase, formatTimeWindow } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";
import { getSpotsInfo } from "@/lib/spots";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const { phone: rawPhone, drop_item_id } = await request.json();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Validate drop item
  const item = getDropItem(drop_item_id);
  if (!item) {
    return NextResponse.json({ error: "Drop item not found" }, { status: 404 });
  }

  // Check purchase window
  if (!canPurchase(item)) {
    return NextResponse.json({ error: "Ordering window is closed for this drop" }, { status: 400 });
  }

  // Check spots
  const { remaining } = await getSpotsInfo(drop_item_id);
  if (remaining <= 0) {
    return NextResponse.json({ error: "Sold out" }, { status: 400 });
  }

  // Normalize phone
  if (!rawPhone) {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }
  const phone = normalizePhone(rawPhone);

  // Check duplicate purchase
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("phone", phone)
    .eq("drop_item_id", drop_item_id)
    .eq("status", "paid")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "You already claimed this spot" }, { status: 409 });
  }

  console.log("[Checkout] Creating session for", phone, drop_item_id);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(item.price * 100),
          product_data: {
            name: `${item.title} — ${item.restaurant_name}`,
            description: `${item.date} · ${formatTimeWindow(item)}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      phone,
      drop_item_id: item.id,
      date: item.date,
      time_window: formatTimeWindow(item),
      restaurant_name: item.restaurant_name,
    },
    success_url: `${appUrl}/ticket/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/deal/${item.id}`,
  });

  console.log("[Checkout] Session created:", session.id);
  return NextResponse.json({ checkoutUrl: session.url });
}
