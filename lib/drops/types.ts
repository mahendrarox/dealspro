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
}
