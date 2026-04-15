import { NextRequest } from "next/server";
import Stripe from "stripe";
import { supabase } from "@/lib/supabase";
import { formatTimeWindow } from "@/lib/drops/helpers";
import { getDropByIdForServer } from "@/lib/drops/db";
import { randomUUID } from "crypto";

// ── Lazy Stripe init — prevents crash if env var missing at module load ──
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is missing from environment variables");
  }
  return new Stripe(key);
}

// ── Structured logging ──────────────────────────────────────────────
function log(event_type: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event_type, timestamp: new Date().toISOString(), ...data }));
}

export async function POST(request: NextRequest) {
  console.log("🔥 WEBHOOK FUNCTION STARTED");

  try {
    log("webhook_received", { url: request.url });

    // ── Init Stripe lazily ──
    let stripe: Stripe;
    try {
      stripe = getStripe();
      log("stripe_init", { success: true });
    } catch (initErr) {
      log("webhook_error", {
        error: "Stripe init failed",
        message: initErr instanceof Error ? initErr.message : String(initErr),
      });
      return new Response("ok", { status: 200 });
    }

    // ── Read raw body and signature ──
    const rawBody = await request.text();
    const sig = request.headers.get("stripe-signature");

    log("webhook_signature_check", {
      has_signature: !!sig,
      body_length: rawBody.length,
      has_webhook_secret: !!process.env.STRIPE_WEBHOOK_SECRET,
    });

    if (!sig) {
      log("webhook_error", { error: "Missing stripe-signature header" });
      return new Response("Missing signature", { status: 400 });
    }

    // ── Construct event ──
    let event: Stripe.Event;
    try {
      log("webhook_constructing_event", { sig_prefix: sig.substring(0, 20) + "..." });
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
      log("webhook_event_constructed", { type: event.type, id: event.id });
    } catch (err) {
      log("webhook_error", {
        error: "Signature verification failed",
        message: err instanceof Error ? err.message : String(err),
      });
      return new Response("Invalid signature", { status: 400 });
    }

    log("webhook_event", { type: event.type, event_id: event.id });

    if (event.type !== "checkout.session.completed") {
      log("webhook_skipped", { type: event.type, reason: "Not checkout.session.completed" });
      return new Response("ok", { status: 200 });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const stripeSessionId = session.id;

    log("webhook_processing", {
      session_id: stripeSessionId,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email,
    });

    // ── Extract metadata ──
    const phone = session.metadata?.phone;
    const dropItemId = session.metadata?.drop_item_id;
    const quantity = parseInt(session.metadata?.quantity || "1") || 1;

    log("webhook_metadata", {
      phone,
      drop_item_id: dropItemId,
      quantity,
      session_id: stripeSessionId,
      all_metadata: session.metadata,
    });

    if (!phone || !dropItemId) {
      log("webhook_error", {
        error: "Missing phone or drop_item_id in metadata",
        stripe_session_id: stripeSessionId,
        metadata: session.metadata,
      });
      return new Response("ok", { status: 200 });
    }

    // ── Server-side price truth — load canonical drop from DB (NO fallback) ──
    const item = await getDropByIdForServer(dropItemId);
    log("webhook_drop_lookup", {
      drop_item_id: dropItemId,
      found: !!item,
      title: item?.title,
      price: item?.price,
      total_spots: item?.total_spots,
    });

    if (!item) {
      log("webhook_error", {
        error: "Unknown drop_item_id — not found in drop_items table",
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
      drop_title: item.title,
      restaurant_name: item.restaurant_name,
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

    log("webhook_rpc_response", {
      stripe_session_id: stripeSessionId,
      rpc_error: rpcError ? { message: rpcError.message, code: rpcError.code, details: rpcError.details } : null,
      rpc_result: rpcResult,
    });

    if (rpcError) {
      log("webhook_error", {
        error: "RPC create_order_atomic failed",
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint,
        drop_item_id: dropItemId,
        phone,
        quantity,
        stripe_session_id: stripeSessionId,
      });
      return new Response("ok", { status: 200 });
    }

    const rpcStatus = rpcResult?.status;
    log("webhook_rpc_status", { status: rpcStatus, stripe_session_id: stripeSessionId });

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
          log("refund_initiating", { payment_intent: paymentIntentId, stripe_session_id: stripeSessionId });
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
        log("sms_init", { phone });
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
        } else {
          log("sms_skipped", { reason: "User not found in users table", phone });
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

    log("webhook_complete", { stripe_session_id: stripeSessionId, status: "success" });
    return new Response("ok", { status: 200 });
  } catch (outerErr) {
    console.error("🚨 WEBHOOK UNHANDLED ERROR:", outerErr);
    log("webhook_error", {
      error: "Unhandled exception in webhook handler",
      message: outerErr instanceof Error ? outerErr.message : String(outerErr),
      stack: outerErr instanceof Error ? outerErr.stack : undefined,
    });
    return new Response("ok", { status: 200 });
  }
}
