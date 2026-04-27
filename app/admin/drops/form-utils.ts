/**
 * Drop form utilities — pure functions and types shared by the form
 * component (`drop-form.tsx`, "use client") and the server pages that
 * mount it (`new/page.tsx`, `[id]/page.tsx`).
 *
 * Lives in its own file (no `"use client"` directive) so server
 * components can safely import it without Next.js bundling these
 * helpers as client-only and breaking SSR.
 */

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

/** Convert a datetime-local input string (local tz) to ISO-8601 with timezone. */
export function toIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return local;
  return d.toISOString();
}

/** Convert an ISO-8601 string to a datetime-local input value. */
export function isoToLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return localToInput(d);
}

/** Slugify a string for use in a drop ID. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
