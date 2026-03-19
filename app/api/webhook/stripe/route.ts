import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { HARDCODED_DROP } from "@/lib/constants";
import { randomUUID } from "crypto";
import twilio from "twilio";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(request: NextRequest) {
  console.log("[Webhook] Stripe webhook received");

  // Read raw body before any parsing — required for signature verification
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    console.error("[Webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[Webhook] Event type:", event.type);

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  console.log("[Webhook] Processing checkout.session.completed:", session.id);

  const userId = session.metadata?.user_id;
  const dropId = session.metadata?.drop_id || HARDCODED_DROP.id;
  const dropTitle = session.metadata?.drop_title || HARDCODED_DROP.title;

  if (!userId) {
    console.error("[Webhook] Missing user_id in session metadata");
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  // Generate unique QR token
  const qrToken = randomUUID();
  const pricePaid = (session.amount_total ?? HARDCODED_DROP.price_cents) / 100;

  // Create order in Supabase
  console.log("[Webhook] Creating order in Supabase");
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      drop_id: dropId,
      drop_title: dropTitle,
      restaurant_name: HARDCODED_DROP.restaurant_name,
      price_paid: pricePaid,
      status: "paid",
      stripe_session_id: session.id,
      qr_token: qrToken,
    })
    .select()
    .single();

  if (orderError || !order) {
    console.error("[Webhook] Order creation failed:", orderError);
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }
  console.log("[Webhook] Order created:", order.id, "token:", qrToken);

  // Fetch user phone for SMS
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("phone, name")
    .eq("id", userId)
    .single();

  if (userError || !user) {
    console.error("[Webhook] Could not fetch user for SMS:", userError);
    // Don't fail — order is created, SMS is best-effort
    return NextResponse.json({ received: true });
  }

  // Send SMS via Twilio
  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${qrToken}`;
  const smsBody =
    `🎉 Your DealsPro ticket is confirmed!\n\n` +
    `${dropTitle}\n` +
    `Restaurant: ${HARDCODED_DROP.restaurant_name}\n` +
    `Pickup: ${HARDCODED_DROP.pickup_window}\n` +
    `Paid: $${pricePaid.toFixed(2)}\n\n` +
    `Show your QR code at the restaurant:\n${ticketUrl}\n\n` +
    `Reply STOP to unsubscribe.`;

  try {
    const msg = await twilioClient.messages.create({
      body: smsBody,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: user.phone,
    });
    console.log("[Webhook] SMS sent, Twilio SID:", msg.sid);
  } catch (smsErr) {
    console.error("[Webhook] SMS send failed:", smsErr);
    // Don't fail webhook — order is saved
  }

  return NextResponse.json({ received: true });
}
