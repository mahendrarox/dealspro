"use client";

import { useState } from "react";
import Button from "./Button";
import { Icons } from "./Icons";

function formatPhone(val: string): string {
  const d = val.replace(/\D/g, "").slice(0, 10);
  if (!d.length) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function CaptureForm({ dark = false }: { dark?: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const digits = phone.replace(/\D/g, "");
  const nameValid = name.trim().length > 0;
  const phoneValid = digits.length === 10;
  const allValid = nameValid && phoneValid && optIn;
  const digitsLeft = 10 - digits.length;

  const submit = async () => {
    if (!allValid) return;
    try {
      await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: `+1${digits}`,
          optIn: true,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) {
      // Silently handle — we still show success
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 animate-fade-up py-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center animate-check-pop"
          style={{ background: "var(--success)" }}
        >
          {Icons.checkWhite}
        </div>
        <div className="font-display font-bold text-lg" style={{ color: dark ? "var(--text-inverse)" : "var(--text-primary)" }}>
          You&apos;re in, {name.trim().split(" ")[0]}!
        </div>
        <div className="font-display text-sm" style={{ color: "var(--text-muted)" }}>
          Check your phone for your first deals.
        </div>
      </div>
    );
  }

  const nameErr = nameTouched && !nameValid;
  const phoneErr = phoneTouched && digits.length > 0 && !phoneValid;
  const nameBorder = nameErr ? "var(--error)" : nameValid && nameTouched ? "var(--success)" : focus === "name" ? "var(--brand-primary)" : dark ? "var(--neutral-800)" : "var(--border-default)";
  const phoneBorder = phoneErr ? "var(--error)" : phoneValid ? "var(--success)" : focus === "phone" ? "var(--brand-primary)" : dark ? "var(--neutral-800)" : "var(--border-default)";

  return (
    <div className="w-full max-w-[460px]">
      {/* Name Input */}
      <div className="relative mb-2.5">
        <input
          type="text"
          placeholder="Your first name"
          value={name}
          onChange={(e) => { setName(e.target.value); if (!nameTouched) setNameTouched(true); }}
          onFocus={() => setFocus("name")}
          onBlur={() => { setFocus(null); setNameTouched(true); }}
          className="w-full font-display text-base font-medium outline-none transition-all duration-200"
          style={{
            padding: "14px 40px 14px 16px",
            border: `2px solid ${nameBorder}`,
            borderRadius: "var(--radius-lg)",
            color: dark ? "var(--text-inverse)" : "var(--text-primary)",
            background: dark ? "var(--neutral-800)" : "var(--surface-white)",
            boxShadow: focus === "name" ? "var(--shadow-focus)" : "none",
          }}
        />
        {nameTouched && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            {nameValid ? Icons.checkGreen : Icons.warning}
          </div>
        )}
      </div>

      {/* Phone Input */}
      <div
        className="flex overflow-hidden transition-all duration-200"
        style={{
          borderRadius: "var(--radius-lg)",
          border: `2px solid ${phoneBorder}`,
          boxShadow: focus === "phone" ? "var(--shadow-focus)" : "none",
          background: dark ? "var(--neutral-800)" : "var(--surface-white)",
        }}
      >
        <div
          className="flex items-center gap-1.5 px-3 shrink-0"
          style={{
            background: dark ? "var(--neutral-950)" : "var(--surface-off-white)",
            borderRight: `1px solid ${dark ? "var(--neutral-800)" : "var(--border-subtle)"}`,
          }}
        >
          <span className="text-base">🇺🇸</span>
          <span className="font-mono text-sm font-bold" style={{ color: "var(--text-muted)" }}>+1</span>
        </div>
        <input
          type="tel"
          placeholder="(555) 123-4567"
          value={phone}
          onChange={(e) => { setPhone(formatPhone(e.target.value)); if (!phoneTouched) setPhoneTouched(true); }}
          onFocus={() => setFocus("phone")}
          onBlur={() => { setFocus(null); setPhoneTouched(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && allValid) submit(); }}
          className="flex-1 font-display text-base font-medium outline-none min-w-0"
          style={{
            padding: "14px",
            border: "none",
            color: dark ? "var(--text-inverse)" : "var(--text-primary)",
            background: "transparent",
          }}
        />
        {phoneTouched && digits.length > 0 && (
          <div className="flex items-center pr-3">
            {phoneValid ? (
              Icons.checkGreen
            ) : (
              <span className="font-mono text-[11px] font-bold" style={{ color: "var(--warning)" }}>
                {digitsLeft} left
              </span>
            )}
          </div>
        )}
      </div>

      {/* Opt-in Checkbox */}
      <label
        className="flex items-start gap-2.5 mt-3.5 cursor-pointer"
        onClick={() => setOptIn(!optIn)}
      >
        <div
          className="w-5 h-5 rounded shrink-0 mt-0.5 flex items-center justify-center transition-all duration-150"
          style={{
            border: `2px solid ${optIn ? "var(--brand-primary)" : dark ? "var(--neutral-400)" : "var(--border-default)"}`,
            background: optIn ? "var(--brand-primary)" : "transparent",
          }}
        >
          {optIn && Icons.checkSmall}
        </div>
        <span className="font-display text-xs leading-relaxed" style={{ color: dark ? "var(--text-muted)" : "var(--text-secondary)" }}>
          I agree to receive exclusive deal alerts and promotions via RCS/SMS.
          Message &amp; data rates may apply. Reply STOP to unsubscribe anytime.
        </span>
      </label>

      {/* Submit Button */}
      <div className="mt-3.5">
        <Button onClick={submit} full disabled={!allValid} style={{ opacity: allValid ? 1 : 0.5 }}>
          {allValid
            ? "Get My Deals"
            : !nameValid
            ? "Enter your name"
            : !phoneValid
            ? `${digitsLeft} digit${digitsLeft !== 1 ? "s" : ""} remaining`
            : "Check the box above"}
        </Button>
      </div>

      <div className="font-display text-xs text-center mt-2.5" style={{ color: "var(--text-muted)" }}>
        Free forever. No spam. Unsubscribe anytime.
      </div>
    </div>
  );
}
