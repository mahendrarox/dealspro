import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

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

  const e164Phone = normalizePhone(phone);
  console.log("[Lead] Normalized phone:", e164Phone);

  // Upsert user into Supabase
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

  // Send SMS with link to deals
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const dealsUrl = `${appUrl}/#deals`;
  const message =
    `Hey ${name.trim()}! Welcome to DealsPro 🔥\n\n` +
    `This week's exclusive restaurant drops are live.\n` +
    `Browse deals: ${dealsUrl}\n\n` +
    `Reply STOP to unsubscribe.`;

  console.log("📩 Sending SMS to:", e164Phone);
  try {
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: e164Phone,
    });
    console.log("✅ SMS sent successfully");
  } catch (error) {
    console.error("❌ SMS error:", error);
  }

  return NextResponse.json({ success: true, user_id: user.id });
}
