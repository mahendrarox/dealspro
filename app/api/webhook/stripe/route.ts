import { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { getDropItem, formatTimeWindow } from "@/lib/constants";
import { randomUUID } from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ── Structured logging ──────────────────────────────────────────────
function log(event_type: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event_type, timestamp: new Date().toISOString(), ...data }));
}

export async function POST(request: NextRequest) {
  try {
    log("webhook_received", {});

    const rawBody = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      log("webhook_error", { error: "Missing stripe-signature header" });
      return new Response("Missing signature", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err) {
      log("webhook_error", {
        error: "Signature verification failed",
        message: err instanceof Error ? err.message : String(err),
      });
      return new Response("Invalid signature", { status: 400 });
    }

    log("webhook_event", { type: event.type });

    if (event.type !== "checkout.session.completed") {
      return new Response("ok", { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const stripeSessionId = session.id;

    log("webhook_processing", { session_id: stripeSessionId });

    // ── Extract metadata ──
    const phone = session.metadata?.phone;
    const dropItemId = session.metadata?.drop_item_id;
    const quantity = parseInt(session.metadata?.quantity || "1") || 1;

    log("webhook_metadata", { phone, drop_item_id: dropItemId, quantity, session_id: stripeSessionId });

    if (!phone || !dropItemId) {
      log("webhook_error", {
        error: "Missing phone or drop_item_id in metadata",
        stripe_session_id: stripeSessionId,
        metadata: session.metadata,
      });
      // Return 200 — can't process, but don't make Stripe retry
      return new Response("ok", { status: 200 });
    }

    // ── Server-side price truth — look up canonical price from constants ──
    const item = getDropItem(dropItemId);
    if (!item) {
      log("webhook_error", {
        error: "Unknown drop_item_id",
        drop_item_id: dropItemId,
        stripe_session_id: stripeSessionId,
      });
      return new Response("ok", { status: 200 });
    }

    const pricePaid = item.price * quantity;
    const qrToken = randomUUID();

    log("webhook_rpc_call", {
      stripe_session_id: stripeSessionId,
      drop_item_id: dropItemId,
      phone,
      quantity,
      price_paid: pricePaid,
      qr_token: qrToken,
      total_spots: item.total_spots,
    });

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
      log("webhook_error", {
        error: "RPC create_order_atomic failed",
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        drop_item_id: dropItemId,
        phone,
        quantity,
        stripe_session_id: stripeSessionId,
      });
      // Return 200 to prevent Stripe from retrying endlessly on persistent errors
      // The structured log above will alert us to investigate
      return new Response("ok", { status: 200 });
    }

    const rpcStatus = rpcResult?.status;
    log("webhook_rpc_result", { status: rpcStatus, result: rpcResult, stripe_session_id: stripeSessionId });

    // ── Branch on RPC result ──
    if (rpcStatus === "duplicate") {
      log("webhook_skipped_duplicate", {
        drop_item_id: dropItemId,
        phone,
        stripe_session_id: stripeSessionId,
        order_id: rpcResult.order_id,
      });
      return new Response("ok", { status: 200 });
    }

    if (rpcStatus === "oversold") {
      log("oversell_detected", {
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
          log("refund_triggered", {
            drop_item_id: dropItemId,
            phone,
            quantity,
            stripe_session_id: stripeSessionId,
            payment_intent: paymentIntentId,
          });
        }
      } catch (refundErr) {
        log("webhook_error", {
          error: "Refund failed",
          message: refundErr instanceof Error ? refundErr.message : String(refundErr),
          stack: refundErr instanceof Error ? refundErr.stack : undefined,
          stripe_session_id: stripeSessionId,
        });
      }

      return new Response("ok", { status: 200 });
    }

    // ── status === "created" ──
    log("order_created", {
      drop_item_id: dropItemId,
      phone,
      quantity,
      stripe_session_id: stripeSessionId,
      order_id: rpcResult.order_id,
      qr_token: rpcResult.qr_token,
    });

    // ── SMS notification (best-effort, lazy Twilio init) ──
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioToken && twilioPhone) {
        const twilio = (await import("twilio")).default;
        const twilioClient = twilio(twilioSid, twilioToken);

        const { data: user } = await supabase
          .from("users")
          .select("phone")
          .eq("phone", phone)
          .maybeSingle();

        if (user) {
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

          const msg = await twilioClient.messages.create({
            body: smsBody,
            from: twilioPhone,
            to: phone,
          });
          log("sms_sent", { drop_item_id: dropItemId, phone, sid: msg.sid });
        }
      } else {
        log("sms_skipped", { reason: "Twilio env vars not configured" });
      }
    } catch (smsErr) {
      log("sms_failed", {
        drop_item_id: dropItemId,
        phone,
        error: smsErr instanceof Error ? smsErr.message : String(smsErr),
      });
    }

    return new Response("ok", { status: 200 });
  } catch (outerErr) {
    // Catch-all: log the error but ALWAYS return 200 to prevent Stripe retries
    console.error("Webhook unhandled error:", outerErr);
    log("webhook_error", {
      error: "Unhandled exception in webhook",
      message: outerErr instanceof Error ? outerErr.message : String(outerErr),
      stack: outerErr instanceof Error ? outerErr.stack : undefined,
    });
    return new Response("ok", { status: 200 });
  }
}
