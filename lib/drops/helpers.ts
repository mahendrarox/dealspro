/**
 * Pure helper functions that operate on a DropItem (time/discount logic).
 *
 * These are intentionally duplicated from `lib/constants.ts` so no runtime
 * file needs to import from constants. `lib/constants.ts` is frozen as a
 * seed-source reference only and is NOT used anywhere at runtime.
 */
import type { DropItem } from "./types";

// ─── Time Helpers ─────────────────────────────────────────────────────
//
// All comparisons AND display below use the authoritative UTC instants
// `start_time_iso` / `end_time_iso`. The string fields `date`,
// `start_time`, `end_time` on DropItem are kept for legacy callers
// (Stripe receipt description, ticket flow) but MUST NOT be used here —
// they are server-local wall-clock projections that render incorrectly
// when the runtime TZ differs from the audience TZ (e.g. Vercel UTC vs
// DFW Central).

/** True if current time is before the drop's start and it isn't cancelled. */
export function canPurchase(item: DropItem): boolean {
  if (item.status === "cancelled") return false;
  const now = Date.now();
  const start = new Date(item.start_time_iso).getTime();
  return now < start;
}

/** True if current time is within the pickup window [start, end). */
export function isPickupInProgress(item: DropItem): boolean {
  const now = Date.now();
  const start = new Date(item.start_time_iso).getTime();
  const end = new Date(item.end_time_iso).getTime();
  return now >= start && now < end;
}

/** True if current time is at or past the drop's end. */
export function hasEnded(item: DropItem): boolean {
  const now = Date.now();
  const end = new Date(item.end_time_iso).getTime();
  return now >= end;
}

/** True if the QR / deal card is still valid for redemption */
export function isRedemptionValid(item: DropItem): boolean {
  return new Date() < new Date(item.redemption_valid_until);
}

// ─── Display TZ (always Central) ──────────────────────────────────────
//
// DealsPro is a DFW-area service. All audience-facing dates and times
// render in America/Chicago regardless of where the server or visitor
// is — the drop is held in Frisco; that's the wall clock that matters.
// Reading from `start_time_iso` / `end_time_iso` with Intl.DateTimeFormat
// makes the output independent of process timezone (was broken on
// Vercel's UTC default).

const DISPLAY_TZ = "America/Chicago";

/** Extract { hour, minute, ampm } from a UTC instant in Central TZ. */
function centralHM(iso: string): { hour: number; minute: number; ampm: "AM" | "PM" } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const ampm = (parts.find((p) => p.type === "dayPeriod")?.value ?? "AM").toUpperCase() as "AM" | "PM";
  return { hour, minute, ampm };
}

/** Extract { y, m, d } from a UTC instant in Central TZ. */
function centralYMD(iso: string | Date): { y: number; m: number; d: number } {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value ?? "0"),
    m: Number(parts.find((p) => p.type === "month")?.value ?? "0"),
    d: Number(parts.find((p) => p.type === "day")?.value ?? "0"),
  };
}

/** Format time window for display: "5–7 PM" or "11 AM–1 PM". */
export function formatTimeWindow(item: DropItem): string {
  const start = centralHM(item.start_time_iso);
  const end = centralHM(item.end_time_iso);
  // Hour-only display unless minute is non-zero (mirrors the prior
  // format — minutes were always silently dropped before).
  const side = (hm: { hour: number; minute: number }) =>
    hm.minute === 0 ? `${hm.hour}` : `${hm.hour}:${String(hm.minute).padStart(2, "0")}`;
  if (start.ampm === end.ampm) {
    return `${side(start)}–${side(end)} ${end.ampm}`;
  }
  return `${side(start)} ${start.ampm}–${side(end)} ${end.ampm}`;
}

/** Format date for display: "Friday, Mar 28" — in Central TZ. */
export function formatDate(item: DropItem): string {
  return new Date(item.start_time_iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: DISPLAY_TZ,
  });
}

/**
 * Human-readable time context with time window.
 * "Tonight · 5–7 PM" | "Tomorrow · 5–7 PM" | "Thu, Apr 2 · 5–7 PM"
 * "Today" / "Tomorrow" comparisons run in America/Chicago so a
 * DFW user sees the same labels regardless of where the server runs.
 */
export function getTimeContext(item: DropItem): string {
  const now = new Date();
  const eventDate = new Date(item.start_time_iso);
  const diffMs = eventDate.getTime() - now.getTime();
  const tw = formatTimeWindow(item);

  if (diffMs < 0) {
    if (isPickupInProgress(item)) return `Pickup in progress · ${tw}`;
    return "Ended";
  }

  const todayCT = centralYMD(now);
  const eventCT = centralYMD(eventDate);
  const todayNum = todayCT.y * 10000 + todayCT.m * 100 + todayCT.d;
  const eventNum = eventCT.y * 10000 + eventCT.m * 100 + eventCT.d;
  const dayDiff = eventNum - todayNum;

  if (dayDiff === 0) {
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours <= 3) return `Starts in ${Math.ceil(diffHours)}h · ${tw}`;
    return `Tonight · ${tw}`;
  }
  if (dayDiff === 1) return `Tomorrow · ${tw}`;

  // "Thu, Apr 2 · 5–7 PM"
  const short = new Date(item.start_time_iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: DISPLAY_TZ,
  });
  return `${short} · ${tw}`;
}

/** Compute savings: original_price - price */
export function getSavings(item: DropItem): number {
  return item.original_price - item.price;
}

/** Compute discount percentage */
export function getDiscountPct(item: DropItem): number {
  return Math.round(((item.original_price - item.price) / item.original_price) * 100);
}
