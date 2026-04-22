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
// All comparisons below use the authoritative UTC instants
// `start_time_iso` / `end_time_iso`. The string fields `date`,
// `start_time`, `end_time` are display-only and MUST NOT be used for
// logic — they are server-local wall-clock projections that silently
// lose the end date when a drop spans midnight.

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

/** Format time window for display: "5–7 PM" or "6–8 PM" */
export function formatTimeWindow(item: DropItem): string {
  const fmt = (t: string) => {
    const [h] = t.split(":").map(Number);
    // Standard 12-hour clock: 0 → 12 AM (midnight), 12 → 12 PM (noon).
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? "PM" : "AM";
    return { hour12, ampm };
  };
  const start = fmt(item.start_time);
  const end = fmt(item.end_time);
  if (start.ampm === end.ampm) {
    return `${start.hour12}–${end.hour12} ${end.ampm}`;
  }
  return `${start.hour12} ${start.ampm}–${end.hour12} ${end.ampm}`;
}

/** Format date for display: "Friday, Mar 28" */
export function formatDate(item: DropItem): string {
  const d = new Date(`${item.date}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** Get current date in US Central Time (DFW area) */
function getCentralDate(d: Date): { year: number; month: number; day: number } {
  const parts = d
    .toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
    .split("/");
  return { year: parseInt(parts[2]), month: parseInt(parts[0]), day: parseInt(parts[1]) };
}

/**
 * Human-readable time context with time window.
 * "Tonight · 5–7 PM" | "Tomorrow · 5–7 PM" | "Thu, Apr 2 · 5–7 PM"
 * Uses US Central Time for today/tomorrow calculations (DFW area).
 */
export function getTimeContext(item: DropItem): string {
  const now = new Date();
  const eventDate = new Date(`${item.date}T${item.start_time}:00`);
  const diffMs = eventDate.getTime() - now.getTime();
  const tw = formatTimeWindow(item);

  if (diffMs < 0) {
    if (isPickupInProgress(item)) return `Pickup in progress · ${tw}`;
    return "Ended";
  }

  const todayCT = getCentralDate(now);
  const [ey, em, ed] = item.date.split("-").map(Number);

  const todayNum = todayCT.year * 10000 + todayCT.month * 100 + todayCT.day;
  const eventNum = ey * 10000 + em * 100 + ed;
  const dayDiff = eventNum - todayNum;

  if (dayDiff === 0) {
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours <= 3) return `Starts in ${Math.ceil(diffHours)}h · ${tw}`;
    return `Tonight · ${tw}`;
  }
  if (dayDiff === 1) return `Tomorrow · ${tw}`;

  // "Thu, Apr 2 · 5–7 PM"
  const d = new Date(`${item.date}T12:00:00`);
  const short = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
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
