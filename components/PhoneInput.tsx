"use client";

import { useState } from "react";

const F = { display: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" };
const C = {
  red500: "#F93A25", green500: "#16A34A", amber500: "#D97706",
  n0: "#FFFFFF", n200: "#E4E4E7", n300: "#D4D4D8", n400: "#A1A1AA",
  n500: "#52525B", n900: "#18181B",
};

/** Format raw input to (XXX) XXX-XXXX mask */
export function formatPhone(val: string): string {
  const d = val.replace(/\D/g, "").slice(0, 10);
  if (!d.length) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Extract 10 digits from formatted phone */
export function getDigits(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

/** Check if phone has exactly 10 digits */
export function isPhoneValid(formatted: string): boolean {
  return getDigits(formatted).length === 10;
}

/** Convert formatted phone to E.164 */
export function toE164(formatted: string): string {
  return `+1${getDigits(formatted)}`;
}

interface PhoneInputProps {
  value: string;
  onChange: (formatted: string) => void;
  onSubmit?: () => void;
  /** Custom label text */
  label?: string;
  /** Show continue button inline */
  showButton?: boolean;
  /** Button text */
  buttonText?: string;
  /** Button loading state */
  buttonLoading?: boolean;
  /** Error message to display below */
  error?: string;
  /** Input background color */
  inputBg?: string;
  /** Border color override for focus ring */
  focusColor?: string;
}

export default function PhoneInput({
  value,
  onChange,
  onSubmit,
  label,
  showButton = false,
  buttonText = "Continue",
  buttonLoading = false,
  error,
  inputBg = C.n0,
  focusColor = C.red500,
}: PhoneInputProps) {
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);

  const digits = getDigits(value);
  const valid = digits.length === 10;
  const digitsLeft = 10 - digits.length;
  const showErr = touched && digits.length > 0 && !valid;

  const borderColor = showErr
    ? "#DC2626"
    : valid
      ? C.green500
      : focused
        ? focusColor
        : C.n300;

  return (
    <div>
      {label && (
        <label style={{
          display: "block", fontFamily: F.display, fontSize: "13px",
          fontWeight: 600, color: C.n900, marginBottom: "6px", letterSpacing: "0.01em",
        }}>
          {label}
        </label>
      )}
      <div style={{ display: "flex", gap: showButton ? "8px" : "0", alignItems: "stretch" }}>
        <div style={{
          display: "flex", flex: 1, borderRadius: "12px", overflow: "hidden",
          border: `2px solid ${borderColor}`,
          boxShadow: focused ? `0 0 0 3px rgba(249,58,37,0.3)` : "none",
          transition: "all 200ms ease", background: inputBg,
        }}>
          {/* Country code prefix */}
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "0 14px", background: C.n200,
            borderRight: `1px solid ${C.n300}`, flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://flagcdn.com/w40/us.png"
              alt="US"
              style={{ width: "20px", height: "14px", objectFit: "cover", borderRadius: "2px" }}
            />
            <span style={{ fontFamily: F.mono, fontSize: "14px", fontWeight: 700, color: C.n500 }}>+1</span>
          </div>

          {/* Input */}
          <input
            type="tel"
            placeholder="(555) 123-4567"
            value={value}
            onChange={(e) => {
              onChange(formatPhone(e.target.value));
              if (!touched) setTouched(true);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setTouched(true); }}
            onKeyDown={(e) => { if (e.key === "Enter" && valid && onSubmit) onSubmit(); }}
            style={{
              flex: 1, padding: "16px 14px", border: "none", outline: "none",
              fontFamily: F.display, fontSize: "16px", fontWeight: 500,
              color: C.n900, background: "transparent", minWidth: 0,
            }}
          />

          {/* Validation indicator */}
          {touched && digits.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", paddingRight: "14px" }}>
              {valid ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.green500} strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span style={{ fontFamily: F.mono, fontSize: "11px", fontWeight: 700, color: C.amber500 }}>
                  {digitsLeft} left
                </span>
              )}
            </div>
          )}
        </div>

        {/* Optional inline button */}
        {showButton && (
          <button
            onClick={valid && onSubmit && !buttonLoading ? onSubmit : undefined}
            disabled={!valid || buttonLoading}
            style={{
              padding: "12px 20px", borderRadius: "12px", border: "none",
              background: !valid ? C.n200 : C.red500,
              color: !valid ? C.n400 : C.n0,
              fontFamily: F.display, fontWeight: 700, fontSize: "14px",
              cursor: !valid || buttonLoading ? "default" : "pointer",
              transition: "all 150ms ease", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {buttonLoading ? "..." : buttonText}
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{ marginTop: "8px", fontSize: "12px", color: C.red500 }}>
          {error}
        </div>
      )}
    </div>
  );
}
