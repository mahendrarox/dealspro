import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabase";
import { HARDCODED_DROP } from "@/lib/constants";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

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
  console.log("[Lead] Upserting user:", { name: name.trim(), phone: e164Phone });
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

  // Send SMS via Twilio
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const claimUrl = `${appUrl}/deal/${HARDCODED_DROP.id}?uid=${user.id}`;
  const message =
    `Hey ${name.trim()}! Your DealsPro drop is ready.\n` +
    `${HARDCODED_DROP.title} - $${(HARDCODED_DROP.price_cents / 100).toFixed(2)} (50% OFF)\n` +
    `Pickup ${HARDCODED_DROP.pickup_window}\n` +
    `Claim here: ${claimUrl}`;

  console.log("📩 Sending SMS to:", e164Phone);
  console.log("📨 Message:", message);

  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: e164Phone,
    });
    console.log("✅ SMS sent successfully");
  } catch (error) {
    console.error("❌ SMS error:", error);
    // Don't fail the request — user is saved, SMS is best-effort
  }

  return NextResponse.json({ success: true });
}
