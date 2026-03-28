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

// ── Structured logging ──────────────────────────────────────────────
function structuredLog(event_type: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    event_type,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

export async function POST(request: NextRequest) {
  structuredLog("webhook_received", {});

  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    structuredLog("webhook_error", { error: "Missing stripe-signature header" });
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    structuredLog("webhook_error", {
      error: "Signature verification failed",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const stripeSessionId = session.id;

  // ── Extract metadata ──
  const phone = session.metadata?.phone;
  const dropItemId = session.metadata?.drop_item_id;
  const quantity = parseInt(session.metadata?.quantity || "1") || 1;

  if (!phone || !dropItemId) {
    structuredLog("webhook_error", {
      error: "Missing phone or drop_item_id in metadata",
      stripe_session_id: stripeSessionId,
    });
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
  }

  // ── Server-side price truth — look up canonical price from constants ──
  const item = getDropItem(dropItemId);
  if (!item) {
    structuredLog("webhook_error", {
      error: "Unknown drop_item_id",
      drop_item_id: dropItemId,
      stripe_session_id: stripeSessionId,
    });
    return NextResponse.json({ error: "Unknown drop item" }, { status: 400 });
  }

  const pricePaid = item.price * quantity;
  const qrToken = randomUUID();

  // ── Call atomic RPC — handles idempotency, capacity check, and insert ──
  const { data: rpcResult, error: rpcError } = await supabase.rpc("create_order_atomic", {
    p_stripe_session_id: stripeSessionId,
    p_phone: phone,
    p_drop_item_id: dropItemId,
    p_drop_title: item.title,
    p_restaurant_name: item.restaurant_name,
    p_price_paid: pricePaid,
    p_quantity: quantity,
    p_qr_token: qrToken,
    p_total_spots: item.total_spots,
  });

  if (rpcError) {
    structuredLog("webhook_error", {
      error: "RPC create_order_atomic failed",
      message: rpcError.message,
      drop_item_id: dropItemId,
      phone,
      quantity,
      stripe_session_id: stripeSessionId,
    });
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }

  const status = rpcResult?.status;

  // ── Branch on RPC result ──
  if (status === "duplicate") {
    structuredLog("webhook_skipped_duplicate", {
      drop_item_id: dropItemId,
      phone,
      quantity,
      stripe_session_id: stripeSessionId,
      order_id: rpcResult.order_id,
    });
    return NextResponse.json({ received: true });
  }

  if (status === "oversold") {
    structuredLog("oversell_detected", {
      drop_item_id: dropItemId,
      phone,
      quantity,
      stripe_session_id: stripeSessionId,
      total_sold: rpcResult.total_sold,
      total_spots: item.total_spots,
    });

    // Full refund via Stripe
    try {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (paymentIntentId) {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
        structuredLog("refund_triggered", {
          drop_item_id: dropItemId,
          phone,
          quantity,
          stripe_session_id: stripeSessionId,
          payment_intent: paymentIntentId,
        });
      }
    } catch (refundErr) {
      structuredLog("webhook_error", {
        error: "Refund failed",
        message: refundErr instanceof Error ? refundErr.message : String(refundErr),
        stack: refundErr instanceof Error ? refundErr.stack : undefined,
        drop_item_id: dropItemId,
        phone,
        stripe_session_id: stripeSessionId,
      });
    }

    return NextResponse.json({ received: true });
  }

  // ── status === "created" ──
  structuredLog("order_created", {
    drop_item_id: dropItemId,
    phone,
    quantity,
    stripe_session_id: stripeSessionId,
    order_id: rpcResult.order_id,
    qr_token: rpcResult.qr_token,
  });

  // ── SMS notification (best-effort) ──
  const usedQrToken = rpcResult.qr_token || qrToken;
  const dealCardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${usedQrToken}`;
  const qtyLabel = quantity > 1 ? `${quantity}x ` : "";
  const smsBody =
    `🎉 Your DealsPro deal card is confirmed!\n\n` +
    `${qtyLabel}${item.title} — ${item.restaurant_name}\n` +
    `📅 ${item.date} · ${formatTimeWindow(item)}\n` +
    `💳 Paid: $${pricePaid.toFixed(2)}\n\n` +
    `Show your deal card at the restaurant:\n${dealCardUrl}\n\n` +
    `Reply STOP to unsubscribe.`;

  try {
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
      structuredLog("sms_sent", {
        drop_item_id: dropItemId,
        phone,
        sid: msg.sid,
      });
    }
  } catch (smsErr) {
    structuredLog("sms_failed", {
      drop_item_id: dropItemId,
      phone,
      error: smsErr instanceof Error ? smsErr.message : String(smsErr),
    });
  }

  return NextResponse.json({ received: true });
}
