import "server-only";
import { adminDb } from "@/lib/supabase-admin";
import type { DropItem } from "./types";

/**
 * Runtime shape of a drop as consumed by the public site.
 *
 * The database is the ONLY source of truth. There is NO fallback to
 * `lib/constants.ts` anywhere in this module. Missing rows return null
 * (for ID lookups) or an empty array (for list queries) — callers must
 * handle those cases explicitly.
 *
 * Schema note: the live `drop_items` table currently has only a subset
 * of the columns defined in `migration-002-studio.sql`. This helper
 * queries the columns that exist and synthesizes safe defaults for the
 * rest so every caller still sees a complete DropItem shape. Once the
 * missing columns (start_time, end_time, is_active, is_hero, priority,
 * image_url, updated_at) are added to the DB, `DB_SELECT_COLS` and
 * `dbRowToDropItem` can be updated to read them directly.
 */
export type RuntimeDropItem = DropItem;

/** Columns that actually exist in the live drop_items table. */
const DB_SELECT_COLS = "id, title, restaurant_name, price, original_price, total_spots, created_at";

type DbDropRow = {
  id: string;
  title: string;
  restaurant_name: string;
  price: number | string;
  original_price: number | string | null;
  total_spots: number;
  created_at: string;
  // Synthesized — not actually stored in DB today
  image_url?: string | null;
  start_time?: string;
  end_time?: string;
  is_active?: boolean;
  is_hero?: boolean;
  priority?: number;
};

/**
 * Normalize a DB row into the legacy DropItem shape expected by existing
 * UI components. Missing columns are synthesized with safe defaults so
 * callers don't need to special-case a partial schema.
 */
function dbRowToDropItem(row: DbDropRow): RuntimeDropItem {
  // Synthetic time window — drops are always purchaseable until the DB
  // has explicit start_time/end_time columns.
  const now = new Date();
  const synthStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const synthEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const start = row.start_time ? new Date(row.start_time) : synthStart;
  const end = row.end_time ? new Date(row.end_time) : synthEnd;

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
    original_price: row.original_price === null || row.original_price === undefined ? 0 : Number(row.original_price),
    total_spots: row.total_spots,
    image_url: row.image_url || "",
    status: row.is_active === false ? "expired" : "live",
    stripe_price_id: "",
    redemption_valid_until: end.toISOString(),
    address: "",
    lat: 0,
    lng: 0,
  };
}

/**
 * Fetch all active drops from the database, ordered for display.
 *
 * No fallback. Returns an empty array on DB error or empty result.
 * Callers must handle the empty case explicitly.
 */
export async function getActiveDropsFromDb(): Promise<RuntimeDropItem[]> {
  const { data, error } = await adminDb
    .from("drop_items")
    .select(DB_SELECT_COLS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[drops/db] getActiveDropsFromDb error:", error.message);
    return [];
  }
  if (!data) return [];

  // Until `is_active` column exists, treat every row as active.
  return (data as DbDropRow[]).map(dbRowToDropItem);
}

/**
 * Fetch a single drop by id from the database.
 *
 * No fallback. Returns null when the DB row is missing. Callers MUST
 * handle the null case and return a user-friendly error.
 */
export async function getDropByIdForServer(id: string): Promise<RuntimeDropItem | null> {
  const { data, error } = await adminDb
    .from("drop_items")
    .select(DB_SELECT_COLS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[drops/db] getDropByIdForServer(${id}) error:`, error.message);
    return null;
  }
  if (!data) return null;
  return dbRowToDropItem(data as DbDropRow);
}

/**
 * Raw DB row (unmangled) — used by checkout validation.
 *
 * Synthesizes the admin-managed fields (is_active=true, end_time=30d out,
 * is_hero=false, priority=0, image_url=null) until the DB has them.
 */
type AdminDropRow = {
  id: string;
  title: string;
  restaurant_name: string;
  image_url: string | null;
  price: number | string;
  original_price: number | string | null;
  total_spots: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_hero: boolean;
  priority: number;
};

export async function getDropRow(id: string): Promise<AdminDropRow | null> {
  const { data, error } = await adminDb
    .from("drop_items")
    .select(DB_SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const now = Date.now();
  return {
    id: (data as DbDropRow).id,
    title: (data as DbDropRow).title,
    restaurant_name: (data as DbDropRow).restaurant_name,
    image_url: (data as DbDropRow).image_url ?? null,
    price: (data as DbDropRow).price,
    original_price: (data as DbDropRow).original_price ?? null,
    total_spots: (data as DbDropRow).total_spots,
    start_time: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    end_time: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
    is_hero: false,
    priority: 0,
  };
}

export { dbRowToDropItem };
export type { DbDropRow, AdminDropRow, DropItem };
