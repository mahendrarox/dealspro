import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { HARDCODED_DROP } from "@/lib/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const { user_id } = await request.json();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  console.log("[Checkout] Creating Stripe session for user_id:", user_id || "anonymous");

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: HARDCODED_DROP.price_cents,
          product_data: {
            name: HARDCODED_DROP.title,
            description: `${HARDCODED_DROP.restaurant_name} · Pickup ${HARDCODED_DROP.pickup_window}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      user_id: user_id || "",
      drop_id: HARDCODED_DROP.id,
      drop_title: HARDCODED_DROP.title,
    },
    success_url: `${appUrl}/ticket/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/deal/${HARDCODED_DROP.id}`,
  });

  console.log("[Checkout] Stripe session created:", session.id);
  return NextResponse.json({ checkoutUrl: session.url });
}
