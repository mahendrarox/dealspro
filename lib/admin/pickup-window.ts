/**
 * Pickup-window validation — the SINGLE shared rule used by both the
 * Studio client forms (`app/admin/drops/drop-form.tsx`) and the server
 * schemas (`lib/admin/schemas.ts`).
 *
 * Existing production rows contain implausible windows (durations of
 * 50h, 146h, 289h, even 720h) because nothing bounded the pickup
 * duration — only `start < end` was enforced. These almost always came
 * from the END DATE drifting while the time-of-day stayed correct.
 *
 * This module bounds new writes. It intentionally does NOT repair or
 * normalize existing rows: editing a historical row that violates the
 * rule will surface the error and require the admin to fix the schedule
 * before saving. Never silently clamp — a silently "corrected" pickup
 * window is how bad data became invisible in the first place.
 *
 * Operates on UTC ISO-8601 instants, so it is timezone-agnostic: a
 * duration is the same number of milliseconds in every zone, including
 * across a DST boundary.
 */

/** Maximum permitted pickup window, in hours. */
export const MAX_PICKUP_WINDOW_HOURS = 12;

/** Maximum permitted pickup window, in milliseconds. */
export const MAX_PICKUP_WINDOW_MS = MAX_PICKUP_WINDOW_HOURS * 60 * 60 * 1000;

export type PickupWindowResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validate a pickup window given two UTC ISO-8601 instants.
 *
 * Rules:
 *   - both instants must parse
 *   - end must be strictly after start
 *   - duration must be <= MAX_PICKUP_WINDOW_HOURS
 *
 * Exactly MAX_PICKUP_WINDOW_HOURS is accepted (inclusive bound).
 */
export function validatePickupWindow(
  startIso: string,
  endIso: string,
): PickupWindowResult {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (Number.isNaN(start)) {
    return { ok: false, message: "Start time is not a valid date and time." };
  }
  if (Number.isNaN(end)) {
    return { ok: false, message: "End time is not a valid date and time." };
  }
  if (end <= start) {
    return {
      ok: false,
      message: "Pickup end must be after pickup start.",
    };
  }
  if (end - start > MAX_PICKUP_WINDOW_MS) {
    const hours = Math.round(((end - start) / (60 * 60 * 1000)) * 10) / 10;
    return {
      ok: false,
      message:
        `Pickup window is ${hours} hours. It must be ${MAX_PICKUP_WINDOW_HOURS} hours or less — ` +
        `check the pickup end DATE, not just the time.`,
    };
  }
  return { ok: true };
}

/** Convenience predicate for schema `.refine()` calls. */
export function isValidPickupWindow(startIso: string, endIso: string): boolean {
  return validatePickupWindow(startIso, endIso).ok;
}
