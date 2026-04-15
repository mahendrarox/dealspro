import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { formatTimeWindow } from "@/lib/drops/helpers";
import { normalizePhone } from "@/lib/phone";
import { getSpotsInfo, CONFIRMED_STATUS } from "@/lib/spots";
import { getDropByIdForServer, getDropRow } from "@/lib/drops/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { phone: rawPhone, drop_item_id } = body ?? {};
    const quantity = Math.max(1, Math.min(4, parseInt(String(body?.quantity ?? 1), 10) || 1));
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!drop_item_id) {
      return NextResponse.json({ error: "Missing drop id" }, { status: 400 });
    }

    // Load drop from DB — database is the ONLY source of truth. No fallback.
    const [item, dbRow] = await Promise.all([
      getDropByIdForServer(drop_item_id),
      getDropRow(drop_item_id),
    ]);

    if (!item || !dbRow) {
      return NextResponse.json(
        { error: "This deal is no longer available" },
        { status: 404 },
      );
    }

    if (dbRow.is_active === false) {
      return NextResponse.json(
        { error: "This deal is not currently active" },
        { status: 400 },
      );
    }

    // Authoritative ordering window from DB's ISO timestamps
    const endMs = new Date(dbRow.end_time).getTime();
    if (Date.now() >= endMs) {
      return NextResponse.json(
        { error: "Ordering has closed for this deal" },
        { status: 400 },
      );
    }

    // Compute remaining using the authoritative total_spots
    const totalSpots = dbRow.total_spots;
    const { remaining } = await getSpotsInfo(drop_item_id, totalSpots);

    if (remaining <= 0) {
      return NextResponse.json(
        { error: "This deal is sold out" },
        { status: 400 },
      );
    }

    if (quantity > remaining) {
      return NextResponse.json(
        { error: "Sorry, not enough spots remaining" },
        { status: 400 },
      );
    }

    // Normalize phone
    if (!rawPhone) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }
    const phone = normalizePhone(rawPhone);

    // Duplicate check
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("phone", phone)
      .eq("drop_item_id", drop_item_id)
      .eq("status", CONFIRMED_STATUS)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "You already claimed this spot" },
        { status: 409 },
      );
    }

    // Server-side price: DB is authoritative.
    const unitAmount = Math.round(Number(dbRow.price) * 100);
    const displayTitle = dbRow.title;
    const displayRestaurant = dbRow.restaurant_name;

    console.log("[Checkout] Creating session for", phone, drop_item_id, { quantity });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: unitAmount,
            product_data: {
              name: `${displayTitle} — ${displayRestaurant}`,
              description: `${item.date} · ${formatTimeWindow(item)}`,
            },
          },
          quantity,
        },
      ],
      metadata: {
        phone,
        drop_item_id,
        quantity: String(quantity),
        date: item.date,
        time_window: formatTimeWindow(item),
        restaurant_name: displayRestaurant,
      },
      success_url: `${appUrl}/ticket/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/drop/${drop_item_id}`,
    });

    console.log("[Checkout] Session created:", session.id);
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("[Checkout] unhandled:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
