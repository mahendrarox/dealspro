import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { getDropItem, formatTimeWindow } from "@/lib/constants";
import { randomUUID } from "crypto";
import twilio from "twilio";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(request: NextRequest) {
  console.log("[Webhook] Stripe webhook received");

  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    console.error("[Webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  console.log("[Webhook] Processing checkout.session.completed:", session.id);

  // ── Idempotency: check if we already processed this session ──
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existingOrder) {
    console.log("[Webhook] Already processed session:", session.id);
    return NextResponse.json({ received: true });
  }

  // ── Extract metadata ──
  const phone = session.metadata?.phone;
  const dropItemId = session.metadata?.drop_item_id;

  if (!phone || !dropItemId) {
    console.error("[Webhook] Missing phone or drop_item_id in metadata");
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
  }

  const item = getDropItem(dropItemId);
  if (!item) {
    console.error("[Webhook] Unknown drop_item_id:", dropItemId);
    return NextResponse.json({ error: "Unknown drop item" }, { status: 400 });
  }

  // ── Generate QR token ──
  const qrToken = randomUUID();
  const pricePaid = (session.amount_total ?? Math.round(item.price * 100)) / 100;

  // ── Insert order ──
  console.log("[Webhook] Creating order for", phone, dropItemId);
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      phone,
      drop_item_id: dropItemId,
      // Keep legacy fields populated for backward compat
      drop_id: dropItemId,
      drop_title: item.title,
      restaurant_name: item.restaurant_name,
      price_paid: pricePaid,
      status: "paid",
      redemption_status: "pending",
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

  // ── Oversold check: count paid orders after insert ──
  const { count: paidCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("drop_item_id", dropItemId)
    .eq("status", "paid");

  if (paidCount !== null && paidCount > item.total_spots) {
    console.warn("[Webhook] OVERSOLD — paid:", paidCount, "total:", item.total_spots);

    // Mark as oversold
    await supabase
      .from("orders")
      .update({ status: "oversold" })
      .eq("id", order.id);

    // Refund via Stripe
    try {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (paymentIntentId) {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
        console.log("[Webhook] Refund issued for oversold order:", order.id);
      }
    } catch (refundErr) {
      console.error("[Webhook] Refund failed:", refundErr);
    }

    return NextResponse.json({ received: true });
  }

  // ── SMS notification (best-effort) ──
  const dealCardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${qrToken}`;
  const smsBody =
    `🎉 Your DealsPro deal card is confirmed!\n\n` +
    `${item.title} — ${item.restaurant_name}\n` +
    `📅 ${item.date} · ${formatTimeWindow(item)}\n` +
    `💳 Paid: $${pricePaid.toFixed(2)}\n\n` +
    `Show your deal card at the restaurant:\n${dealCardUrl}\n\n` +
    `Reply STOP to unsubscribe.`;

  try {
    // Look up user by phone for name
    const { data: user } = await supabase
      .from("users")
      .select("phone")
      .eq("phone", phone)
      .maybeSingle();

    if (user) {
      const msg = await twilioClient.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: phone,
      });
      console.log("[Webhook] SMS sent, SID:", msg.sid);
    }
  } catch (smsErr) {
    console.error("[Webhook] SMS send failed:", smsErr);
  }

  return NextResponse.json({ received: true });
}
