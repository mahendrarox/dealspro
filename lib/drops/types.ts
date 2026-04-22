/**
 * Canonical DropItem shape used throughout the runtime app.
 *
 * This type mirrors what `lib/drops/db.ts::dbRowToDropItem()` produces
 * when it normalizes a `drop_items` row into the legacy shape expected
 * by existing components. It is INTENTIONALLY decoupled from
 * `lib/constants.ts` so no runtime file needs to import from constants.
 *
 * `lib/constants.ts` is frozen as a seed-source reference only.
 */
export interface DropItem {
  id: string;
  drop_id: string;
  restaurant_name: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM" 24h
  end_time: string; // "HH:MM" 24h
  /**
   * start_time_iso and end_time_iso are the ONLY source of truth for time comparisons.
   * date, start_time, and end_time (string fields) are display-only.
   * NEVER use the string fields for logic — they can be incorrect for drops spanning midnight.
   */
  start_time_iso: string; // full UTC ISO-8601 string from drop_items.start_time
  end_time_iso: string;   // full UTC ISO-8601 string from drop_items.end_time
  price: number; // decimal dollars (e.g. 9.99)
  original_price: number;
  total_spots: number;
  image_url: string;
  status: "live" | "sold_out" | "expired" | "cancelled";
  stripe_price_id: string;
  redemption_valid_until: string; // ISO datetime
  address: string;
  lat: number;
  lng: number;
  /** Admin-managed hero flag (drop_items.is_hero). Optional for legacy callers. */
  is_hero?: boolean;
  /** Admin-managed display priority (drop_items.priority). Lower comes first. */
  priority?: number;
}
