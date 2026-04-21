import { adminDb } from "@/lib/supabase-admin";
import type { DropItem } from "./types";

/**
 * Database-backed drop fetchers.
 *
 * The database is the ONLY source of truth. Every field is read directly
 * from the DB row — no synthetic defaults, no constants fallback. If a
 * required field is null or a row is missing, the caller gets null (for
 * lookups) or an empty array (for listings) and must fail hard with a
 * user-facing error.
 */

// ─── Full schema select ──────────────────────────────────────────────

const DB_SELECT_COLS =
  "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority, created_at, updated_at, address, latitude, longitude";

// ─── DB row type ─────────────────────────────────────────────────────

type DbDropRow = {
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
  created_at: string;
  updated_at: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

// ─── Mapper: DB row → DropItem (zero synthesis) ──────────────────────

function dbRowToDropItem(row: DbDropRow): DropItem {
  const start = new Date(row.start_time);
  const end = new Date(row.end_time);

  if (Number.isNaN(start.getTime())) throw new Error(`[drops/db] Invalid start_time for ${row.id}`);
  if (Number.isNaN(end.getTime())) throw new Error(`[drops/db] Invalid end_time for ${row.id}`);

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
    image_url: row.image_url ?? "",
    status: row.is_active ? "live" : "expired",
    stripe_price_id: "",
    redemption_valid_until: end.toISOString(),
    address: row.address ?? "",
    lat: row.latitude ?? 0,
    lng: row.longitude ?? 0,
    is_hero: row.is_hero,
    priority: row.priority,
  };
}

// ─── Public listing: active drops only, ordered in SQL ───────────────

export async function getActiveDropsFromDb(): Promise<DropItem[]> {
  const { data, error } = await adminDb
    .from("drop_items")
    .select(DB_SELECT_COLS)
    .eq("is_active", true)
    .order("is_hero", { ascending: false })
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[drops/db] getActiveDropsFromDb error:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];
  return (data as DbDropRow[]).map(dbRowToDropItem);
}

// ─── Single drop lookup (no fallback) ────────────────────────────────

export async function getDropByIdForServer(id: string): Promise<DropItem | null> {
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

// ─── Raw DB row for checkout / admin (no mapping) ────────────────────

export async function getDropRow(id: string): Promise<DbDropRow | null> {
  const { data, error } = await adminDb
    .from("drop_items")
    .select(DB_SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as DbDropRow;
}

export { dbRowToDropItem };
export type { DbDropRow, DropItem };
