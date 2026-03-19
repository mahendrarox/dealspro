import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { HARDCODED_DROP } from "@/lib/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  console.log("[Lead] Form submit received");

  let body: { name?: string; phone?: string; optIn?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, phone, optIn } = body;

  if (!name || !phone || !optIn) {
    console.log("[Lead] Validation failed — missing fields");
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Normalize phone to E.164 (+1XXXXXXXXXX)
  const digits = phone.replace(/\D/g, "");
  const e164Phone = digits.startsWith("1") ? `+${digits}` : `+1${digits}`;
  console.log("[Lead] Normalized phone:", e164Phone);

  // Upsert user into Supabase
  console.log("[Lead] Upserting user:", { name, phone: e164Phone });
  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert(
      {
        name: name.trim(),
        phone: e164Phone,
        consent: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" }
    )
    .select()
    .single();

  if (userError || !user) {
    console.error("[Lead] Supabase upsert error:", userError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  console.log("[Lead] User upserted, id:", user.id);

  // Create Stripe Checkout Session
  console.log("[Lead] Creating Stripe checkout session");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
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
        user_id: user.id,
        drop_id: HARDCODED_DROP.id,
        drop_title: HARDCODED_DROP.title,
      },
      success_url: `${appUrl}/ticket/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}`,
    });
  } catch (err) {
    console.error("[Lead] Stripe session creation error:", err);
    return NextResponse.json({ error: "Payment setup failed" }, { status: 500 });
  }

  console.log("[Lead] Stripe checkout session created:", session.id);
  return NextResponse.json({ checkoutUrl: session.url });
}
