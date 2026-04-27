"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drop image URL input + live preview.
 *
 * Mirrors the public DropCard image area (100% × 200px, 16px rounded,
 * `object-fit: cover`, gradient fallback) so what the admin sees in the
 * Studio matches what customers see on the homepage card.
 *
 * Phase 1: URL only — no upload, no AI, no storage. Validation is
 * inline; an empty URL is allowed and renders the gradient fallback.
 */

const T = {
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  amber: "#D97706",
  input: "#0A0A0A",
};

// Same gradient as the public DropCard fallback (DropsSection.tsx:136).
const FALLBACK_GRADIENT = "linear-gradient(135deg, #1f2937, #374151)";
const PUBLIC_CARD_BORDER_RADIUS = 16;
const PUBLIC_CARD_HEIGHT_PX = 200;
const PUBLIC_CARD_MAX_WIDTH_PX = 400;

const MIN_NATURAL_WIDTH = 800;
const MIN_NATURAL_HEIGHT = 500;

type LoadState = "empty" | "loading" | "success" | "error";

/**
 * Returns null if the URL is acceptable (empty, http, or https), or an
 * inline error message otherwise. Empty is always OK — the field is
 * optional and an empty value falls back to the gradient.
 */
export function validateImageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Enter a valid URL starting with http:// or https://";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "Only http:// or https:// URLs are supported";
  }
  return null;
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Server-side field error from zod (e.g. "must be a valid URL"). */
  serverError?: string;
};

export default function DropImageInput({ value, onChange, serverError }: Props) {
  const [debouncedUrl, setDebouncedUrl] = useState(value);
  const [loadState, setLoadState] = useState<LoadState>(value.trim() ? "loading" : "empty");
  const [lowRes, setLowRes] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Local validation (client-side, inline). Independent of server zod errors.
  const localError = validateImageUrl(value);

  // Debounce the URL → preview transition so rapid typing doesn't
  // thrash through error/loading states. Settle 250 ms after the last
  // keystroke before we actually try to load.
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed === "") {
      setDebouncedUrl("");
      setLoadState("empty");
      setLowRes(null);
      return;
    }
    if (localError) {
      // Don't try to render an obviously-bad URL.
      setLoadState("empty");
      setLowRes(null);
      return;
    }
    const id = setTimeout(() => {
      setDebouncedUrl(trimmed);
      setLoadState("loading");
      setLowRes(null);
    }, 250);
    return () => clearTimeout(id);
  }, [value, localError]);

  const onImgLoad = () => {
    setLoadState("success");
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w > 0 && h > 0 && (w < MIN_NATURAL_WIDTH || h < MIN_NATURAL_HEIGHT)) {
      setLowRes({ w, h });
    } else {
      setLowRes(null);
    }
  };

  const onImgError = () => {
    setLoadState("error");
    setLowRes(null);
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: T.muted,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        Image URL (leave empty for gradient fallback)
      </label>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://images.unsplash.com/..."
        data-testid="drop-image-url-input"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${localError ? T.red : T.border}`,
          background: T.input,
          color: T.text,
          fontSize: 14,
          fontFamily: "'DM Sans', sans-serif",
        }}
      />

      {localError && (
        <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{localError}</div>
      )}
      {!localError && serverError && (
        <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{serverError}</div>
      )}

      {/* ─── Preview area — exact match for public DropCard image (200px, 16px radius, cover, gradient fallback) ─── */}
      <div
        data-testid="drop-image-preview"
        data-state={loadState}
        style={{
          position: "relative",
          marginTop: 8,
          width: "100%",
          maxWidth: PUBLIC_CARD_MAX_WIDTH_PX,
          height: PUBLIC_CARD_HEIGHT_PX,
          borderRadius: PUBLIC_CARD_BORDER_RADIUS,
          overflow: "hidden",
          background: FALLBACK_GRADIENT,
          border: `1px solid ${T.border}`,
        }}
      >
        {/* Hidden img drives onLoad/onError. Visible only on success. */}
        {debouncedUrl && !localError && (
          <img
            ref={imgRef}
            src={debouncedUrl}
            alt=""
            onLoad={onImgLoad}
            onError={onImgError}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              display: loadState === "success" ? "block" : "none",
            }}
          />
        )}

        {/* Centered overlay text per state */}
        {loadState !== "success" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              letterSpacing: 0.3,
              textAlign: "center",
              padding: 16,
              pointerEvents: "none",
            }}
          >
            {loadState === "empty" && "No image yet"}
            {loadState === "loading" && "Loading preview…"}
            {loadState === "error" && "Image could not load"}
          </div>
        )}
      </div>

      {lowRes && loadState === "success" && (
        <div
          data-testid="drop-image-lowres-warning"
          style={{
            marginTop: 6,
            fontSize: 11,
            color: T.amber,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ⚠ Image may look blurry on mobile ({lowRes.w}×{lowRes.h}; recommended ≥{MIN_NATURAL_WIDTH}×{MIN_NATURAL_HEIGHT}).
        </div>
      )}
    </div>
  );
}
