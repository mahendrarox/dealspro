import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

export async function POST(request: NextRequest) {
  console.log("[Lead] Form submit received");

  let body: { name?: string; phone?: string; optIn?: boolean; sourceSlug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // `sourceSlug` is accepted for forward-compat with the /r/[slug] capture
  // form but intentionally NOT persisted (attribution is out of scope for
  // this change). Destructured only so it never leaks into the upsert.
  const { name, phone, optIn } = body;

  if (!phone) {
    console.log("[Lead] Validation failed — no phone");
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  const e164Phone = normalizePhone(phone);
  console.log("[Lead] Normalized phone:", e164Phone);

  // Full form submission (homepage): requires name + optIn
  // Quick capture (drop page): phone only — upsert with minimal data
  const isFullForm = !!name && optIn !== undefined;

  if (isFullForm && (!name || !optIn)) {
    console.log("[Lead] Full form validation failed — missing name or optIn");
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Strict boolean: explicit opt-in is true ONLY for a literal `true`.
  // Every other value — missing, false, null, "true"/"false" strings, 1/0,
  // objects — resolves to false.
  const explicitOptIn = optIn === true;

  // ── MONOTONIC CONSENT (preservation) ────────────────────────────────
  // Consent may only ever go UP through this path. Read the existing row
  // and merge so a returning user who omits the opt-in box (quick capture,
  // claim form, etc.) can NEVER silently downgrade an existing `true`.
  // Only STOP / admin / system unsubscribe workflows may set consent false.
  const { data: existing } = await supabase
    .from("users")
    .select("name, consent")
    .eq("phone", e164Phone)
    .maybeSingle();

  // true is sticky; false/null upgrades to true only on explicit opt-in.
  const consent = existing?.consent === true ? true : explicitOptIn;

  // Never clobber an existing real name with the placeholder on a
  // name-less capture. A freshly provided name still wins.
  const finalName = name?.trim() || existing?.name || "DealsPro User";

  const upsertData: Record<string, unknown> = {
    phone: e164Phone,
    name: finalName,
    consent,
    updated_at: new Date().toISOString(),
  };

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert(upsertData, { onConflict: "phone" })
    .select()
    .single();

  if (userError || !user) {
    console.error("[Lead] Supabase upsert error:", userError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  console.log("[Lead] User upserted, id:", user.id);

  // Send SMS only for full form submissions (homepage)
  if (isFullForm && name) {
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioToken && twilioPhone) {
        const twilio = (await import("twilio")).default;
        const twilioClient = twilio(twilioSid, twilioToken);

        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        const dealsUrl = `${appUrl}/#deals`;
        const message =
          `Hey ${name.trim()}! Welcome to DealsPro 🔥\n\n` +
          `This week's exclusive restaurant drops are live.\n` +
          `Browse deals: ${dealsUrl}\n\n` +
          `Reply STOP to unsubscribe.`;

        console.log("📩 Sending SMS to:", e164Phone);
        await twilioClient.messages.create({
          body: message,
          from: twilioPhone,
          to: e164Phone,
        });
        console.log("✅ SMS sent successfully");
      } else {
        console.log("[Lead] SMS skipped — Twilio env vars not configured");
      }
    } catch (error) {
      console.error("❌ SMS error:", error);
    }
  }

  return NextResponse.json({ success: true, user_id: user.id });
}
