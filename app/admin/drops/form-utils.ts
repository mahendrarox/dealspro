/**
 * Drop form utilities — pure functions and types shared by the form
 * component (`drop-form.tsx`, "use client") and the server pages that
 * mount it (`new/page.tsx`, `[id]/page.tsx`).
 *
 * Lives in its own file (no `"use client"` directive) so server
 * components can safely import it without Next.js bundling these
 * helpers as client-only and breaking SSR.
 */

import { slugify } from "@/lib/slug";

export type LocationMode = "autocomplete" | "manual";

/**
 * CREATE-form values. `restaurant_id` is the new partner-FK input.
 * The legacy inline location strings remain as a read-only display
 * source for legacy drops in EDIT mode (see `DropEditFormValues`).
 */
export type DropCreateFormValues = {
  id: string;
  title: string;
  restaurant_id: string;
  image_url: string;
  price: string;
  original_price: string;
  total_spots: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_hero: boolean;
  priority: string;
};

/**
 * EDIT-form values. The edit form continues to accept the legacy
 * inline location fields — drops keep their own copy of restaurant
 * data (denormalized at create time), and legacy drops have only
 * those inline fields with no FK.
 */
export type DropEditFormValues = {
  id: string;
  title: string;
  restaurant_name: string;
  restaurant_id: string | null; // read-only display in edit mode
  image_url: string;
  price: string;
  original_price: string;
  total_spots: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_hero: boolean;
  priority: string;
  address: string;
  latitude: string;
  longitude: string;
  place_id: string;
  location_mode: LocationMode;
};

// ─── Smart defaults ──────────────────────────────────────────────────
//
// Most drops in production are 2-hour evening windows priced ~$10–15
// with 7 spots. Pre-fill the form to that shape so the admin's typing
// burden drops to: title + restaurant + price.

const DEFAULT_TOTAL_SPOTS = "7";
const DEFAULT_DURATION_HOURS = 2;
const DEFAULT_EVENING_HOUR_LOCAL = 18; // 6 PM
const SAME_DAY_CUTOFF_HOUR_LOCAL = 16; // before 4 PM → today; otherwise tomorrow

/** datetime-local string for "next sensible 6 PM evening slot". */
function defaultStartLocal(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() >= SAME_DAY_CUTOFF_HOUR_LOCAL) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(DEFAULT_EVENING_HOUR_LOCAL, 0, 0, 0);
  return localToInput(d);
}

/** Add `hours` to a datetime-local string and return a new datetime-local string. */
export function addHoursToLocal(local: string, hours: number): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  d.setHours(d.getHours() + hours);
  return localToInput(d);
}

function localToInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const DEFAULT_DROP_DURATION_HOURS = DEFAULT_DURATION_HOURS;

export const emptyDropForm = (now: Date = new Date()): DropCreateFormValues => {
  const start = defaultStartLocal(now);
  const end = addHoursToLocal(start, DEFAULT_DURATION_HOURS);
  return {
    id: "",
    title: "",
    restaurant_id: "",
    image_url: "",
    price: "",
    original_price: "",
    total_spots: DEFAULT_TOTAL_SPOTS,
    start_time: start,
    end_time: end,
    is_active: true,
    is_hero: false,
    priority: "0",
  };
};

// ─── Timezone: pinned to America/Chicago ─────────────────────────────
//
// Studio datetime-local inputs are entered as Dallas-area (Central) wall
// clock. We convert Central ⇄ UTC explicitly so the stored instant never
// depends on the admin's browser/device/server timezone. The offset is
// derived from the IANA zone "America/Chicago" via Intl, so it stays
// DST-correct (CDT/UTC−5 vs CST/UTC−6) without hardcoding −5/−6.
//
// MVP scope: a single pinned zone is intentional for the Dallas-area
// pilot. Restaurant-specific timezones are deferred to a later PR.
const STUDIO_TZ = "America/Chicago";

/**
 * Offset (ms) of `STUDIO_TZ` from UTC at the instant `date`, defined as
 * wallClock − utc. Negative for Central (e.g. −5h CDT, −6h CST). DST-safe
 * because it asks Intl for the zone's actual wall clock at that instant.
 */
function tzOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  // Some engines emit "24" for midnight; normalize to 0.
  const hour = m.hour === "24" ? 0 : Number(m.hour);
  const wallAsUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    hour,
    Number(m.minute),
    Number(m.second),
  );
  return wallAsUtc - date.getTime();
}

/**
 * Convert a datetime-local input string (interpreted as America/Chicago
 * wall clock) to a UTC ISO-8601 string. Does NOT rely on the host timezone.
 */
export function toIso(local: string): string {
  if (!local) return "";
  // Parse the wall-clock fields directly — never `new Date(local)`, which
  // would interpret them in the host timezone.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return local;
  const [, y, mo, d, h, mi] = match;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  // The UTC instant t satisfies: wallAsUtc = t + offset(t). Solve for t,
  // re-checking the offset at the candidate instant to stay correct across
  // DST boundaries (offset can differ between the guess and the answer).
  let offset = tzOffsetMs(new Date(wallAsUtc));
  let t = wallAsUtc - offset;
  const offset2 = tzOffsetMs(new Date(t));
  if (offset2 !== offset) t = wallAsUtc - offset2;
  return new Date(t).toISOString();
}

/**
 * Convert a stored UTC ISO-8601 string to a datetime-local input value
 * expressed in America/Chicago wall clock. Does NOT rely on the host
 * timezone.
 */
export function isoToLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
}

// Slugify is the canonical shared util in `lib/slug.ts`. Imported for local
// use (suggestDropSlug) and re-exported so existing imports
// (`./form-utils`) keep working unchanged.
export { slugify };

/** Build a reasonable default drop slug from restaurant + title + start date. */
export function suggestDropSlug(opts: {
  restaurantName: string;
  title: string;
  startTimeLocal: string;
}): string {
  const restPart = slugify(opts.restaurantName).split("-").slice(0, 2).join("-");
  const titlePart = slugify(opts.title).split("-").slice(0, 3).join("-");
  let datePart = "";
  if (opts.startTimeLocal) {
    const d = new Date(opts.startTimeLocal);
    if (!Number.isNaN(d.getTime())) {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      datePart = `${months[d.getMonth()]}${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  const parts = ["drop", restPart, titlePart, datePart].filter(Boolean);
  return parts.join("-").replace(/-+/g, "-");
}
