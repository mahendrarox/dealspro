import "server-only";
import { adminDb } from "@/lib/supabase-admin";
import { DROP_ITEMS, getDropItem, type DropItem } from "@/lib/constants";

/**
 * Runtime shape of a drop as consumed by the public site.
 * Compatible with the existing DropItem type from lib/constants.ts so that
 * components receiving this object do not need to change.
 *
 * Key difference: DB rows store start_time/end_time as ISO timestamps, while
 * constants.ts splits them into date + start_time + end_time strings. This
 * helper normalizes both back into the DropItem shape.
 */
export type RuntimeDropItem = DropItem;

type DbDropRow = {
  id: string;
  title: string;
  restaurant_name: string;
  image_url: string | null;
  price: number | string; // numeric comes back as string via supabase-js
  original_price: number | string | null;
  total_spots: number;
  start_time: string; // ISO
  end_time: string; // ISO
  is_active: boolean;
  is_hero: boolean;
  priority: number;
};

/** Normalize a DB row to the legacy DropItem shape used by existing components. */
function dbRowToDropItem(row: DbDropRow): RuntimeDropItem {
  const start = new Date(row.start_time);
  const end = new Date(row.end_time);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const startTimeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endTimeStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

  return {
    id: row.id,
    drop_id: "db",
    restaurant_name: row.restaurant_name,
    title: row.title,
    date: dateStr,
    start_time: startTimeStr,
    end_time: endTimeStr,
    price: Number(row.price),
    original_price: row.original_price === null ? 0 : Number(row.original_price),
    total_spots: row.total_spots,
    image_url: row.image_url || "",
    status: row.is_active ? "live" : "expired",
    stripe_price_id: "",
    redemption_valid_until: end.toISOString(),
    address: "",
    lat: 0,
    lng: 0,
  };
}

/**
 * Fetch all active drops from the database, ordered for display:
 * hero rows first, then lowest priority, then newest.
 *
 * On DB failure, falls back to the in-memory DROP_ITEMS array from
 * constants.ts. This preserves the existing behavior while the seed
 * pipeline is stabilized (migration plan step 3).
 */
export async function getActiveDropsFromDb(): Promise<RuntimeDropItem[]> {
  try {
    const { data, error } = await adminDb
      .from("drop_items")
      .select(
        "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority",
      )
      .eq("is_active", true)
      .order("is_hero", { ascending: false })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      // Empty DB → safety fallback to seed source
      return [...DROP_ITEMS];
    }
    return (data as DbDropRow[]).map(dbRowToDropItem);
  } catch (err) {
    console.error("[drops/db] getActiveDropsFromDb fallback:", err);
    return [...DROP_ITEMS];
  }
}

/**
 * Fetch a single drop by id from the database.
 *
 * Safety fallback: if the DB row is missing or the query fails, we fall
 * back to `getDropItem(id)` from constants. This keeps the checkout and
 * webhook hot paths safe during the migration window.
 */
export async function getDropByIdForServer(id: string): Promise<RuntimeDropItem | null> {
  try {
    const { data, error } = await adminDb
      .from("drop_items")
      .select(
        "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (data) return dbRowToDropItem(data as DbDropRow);
  } catch (err) {
    console.error("[drops/db] getDropByIdForServer db error:", err);
  }
  // Fallback: constants.ts
  return getDropItem(id) ?? null;
}

/** Strict DB-only lookup with no fallback. Reserved for a future cleanup PR. */
export async function getDropByIdStrict(id: string): Promise<RuntimeDropItem | null> {
  const { data, error } = await adminDb
    .from("drop_items")
    .select(
      "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return dbRowToDropItem(data as DbDropRow);
}

/** Retrieve the raw DB row (unmangled) — used by admin list + checkout validation. */
export async function getDropRow(id: string): Promise<DbDropRow | null> {
  const { data, error } = await adminDb
    .from("drop_items")
    .select(
      "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as DbDropRow;
}

export { dbRowToDropItem };
export type { DbDropRow };
