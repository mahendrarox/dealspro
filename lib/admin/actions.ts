"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import {
  dropCreateSchema,
  dropUpdateSchema,
  restaurantCreateSchema,
  restaurantUpdateSchema,
  type DropUpdateInput,
  type RestaurantCreateInput,
  type RestaurantUpdateInput,
} from "./schemas";
import { adminDb } from "@/lib/supabase-admin";
import { diffFields, logAdminAction } from "./log";
import type { Restaurant, RestaurantOption } from "./restaurants/types";
// Archive reuses the LIVE status-engine helpers for window math — no copied
// timezone/comparison logic lives in the archive feature.
import { canPurchase, isPickupInProgress } from "@/lib/drops/helpers";
import { dbRowToDropItem, DB_SELECT_COLS, isMissingArchivedColumn } from "@/lib/drops/db";
import { evaluateArchive } from "./archive";

type ActionResult<T = unknown> =
  | { ok: true; data?: T; noop?: boolean }
  | { ok: false; error?: string; fieldErrors?: Record<string, string[]> };

type ArchiveResult =
  | { ok: true; noop?: boolean }
  | {
      ok: false;
      error?: string;
      blocked?: boolean;
      reason?: string;
      requiresConfirmation?: boolean;
      message?: string;
    };

/**
 * Strip the form-only `location_mode` discriminator before persisting —
 * it's a client/server validation hint, not a DB column.
 */
function toDbUpdateRow(parsed: DropUpdateInput) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { location_mode, ...rest } = parsed;
  return {
    ...rest,
    image_url: rest.image_url || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// DROP — CREATE
// ═══════════════════════════════════════════════════════════════════════
//
// New flow: admin selects a partner restaurant (UUID). The server looks
// up that restaurant, copies its denormalized location fields onto the
// drop row, and stores the FK. Legacy display code keeps reading from
// the inline columns; the FK becomes the source of truth going forward.
export async function createDrop(input: unknown): Promise<ActionResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = dropCreateSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, error: "Validation failed", fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }

  // Look up the partner restaurant — must exist AND be active.
  const { data: restaurant, error: restErr } = await adminDb
    .from("restaurants")
    .select("id, name, address, latitude, longitude, place_id, is_active")
    .eq("id", parsed.data.restaurant_id)
    .maybeSingle();

  if (restErr) {
    return { ok: false, error: "Could not load restaurant" };
  }
  if (!restaurant) {
    return {
      ok: false,
      error: "Partner restaurant not found",
      fieldErrors: { restaurant_id: ["Partner restaurant not found"] },
    };
  }
  if (!restaurant.is_active) {
    return {
      ok: false,
      error: "Selected restaurant is not active",
      fieldErrors: { restaurant_id: ["This restaurant is currently inactive"] },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { restaurant_id, ...dropFields } = parsed.data;
  const row = {
    ...dropFields,
    image_url: dropFields.image_url || null,
    restaurant_id: restaurant.id,
    // Denormalize for compatibility with existing display code.
    restaurant_name: restaurant.name,
    address: restaurant.address,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    place_id: restaurant.place_id,
  };

  const { data, error } = await adminDb
    .from("drop_items")
    .insert(row)
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message.includes("duplicate") ? "A drop with that id already exists" : "Could not create drop" };
  }

  await logAdminAction(admin.email, "create_drop", data.id, { after: data });
  revalidatePath("/admin/drops");
  revalidatePath("/");
  return { ok: true, data };
}

// ═══════════════════════════════════════════════════════════════════════
// DROP — UPDATE (idempotent: diff before writing)
// ═══════════════════════════════════════════════════════════════════════
export async function updateDrop(id: string, input: unknown): Promise<ActionResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = dropUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, error: "Validation failed", fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }

  const { data: current, error: fetchErr } = await adminDb
    .from("drop_items")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !current) {
    return { ok: false, error: "Drop not found" };
  }

  const nextRow = toDbUpdateRow(parsed.data);

  const changes = diffFields(current as Record<string, unknown>, nextRow as Record<string, unknown>);
  if (Object.keys(changes).length === 0) {
    return { ok: true, data: current, noop: true };
  }

  const { data, error } = await adminDb
    .from("drop_items")
    .update(nextRow)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { ok: false, error: "Could not update drop" };
  }

  await logAdminAction(admin.email, "update_drop", id, changes);
  revalidatePath("/admin/drops");
  revalidatePath("/");
  revalidatePath(`/drop/${id}`);
  return { ok: true, data };
}

// ═══════════════════════════════════════════════════════════════════════
// DROP — TOGGLE is_active
// ═══════════════════════════════════════════════════════════════════════
export async function toggleActive(id: string): Promise<ActionResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: current, error: fetchErr } = await adminDb
    .from("drop_items")
    .select("is_active")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !current) {
    return { ok: false, error: "Drop not found" };
  }

  const newValue = !current.is_active;
  const { error } = await adminDb
    .from("drop_items")
    .update({ is_active: newValue })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not toggle" };

  await logAdminAction(admin.email, "toggle_active", id, {
    is_active: { before: current.is_active, after: newValue },
  });
  revalidatePath("/admin/drops");
  revalidatePath("/");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
// DROP — TOGGLE is_hero
// ═══════════════════════════════════════════════════════════════════════
export async function toggleHero(id: string): Promise<ActionResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: current, error: fetchErr } = await adminDb
    .from("drop_items")
    .select("is_hero")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !current) {
    return { ok: false, error: "Drop not found" };
  }

  const newValue = !current.is_hero;

  if (newValue) {
    const { error: rpcErr } = await adminDb.rpc("set_hero_drop", { target_id: id });
    if (rpcErr) {
      console.error("[toggleHero] set_hero_drop RPC failed:", rpcErr.message);
      return { ok: false, error: "Could not set hero" };
    }
  } else {
    const { error } = await adminDb
      .from("drop_items")
      .update({ is_hero: false })
      .eq("id", id);
    if (error) {
      console.error("[toggleHero] unset failed:", error.message);
      return { ok: false, error: "Could not unset hero" };
    }
  }

  await logAdminAction(admin.email, "toggle_hero", id, {
    is_hero: { before: current.is_hero, after: newValue },
  });
  revalidatePath("/admin/drops");
  revalidatePath("/");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
// DROP — ARCHIVE (non-destructive soft-hide)
// ═══════════════════════════════════════════════════════════════════════
//
// Two-call contract:
//   1. Client calls with confirmedImpact:false.
//   2. Server re-fetches FRESH state and evaluates impact every call.
//      - Hero/featured → blocked (always wins).
//      - Impact risk + not confirmed → requiresConfirmation.
//   3. Client re-calls with confirmedImpact:true after a strong confirm.
//      - Server RE-CHECKS from scratch (never trusts the prior call), so a
//        drop that became hero in between is still blocked.
//
// Archive only sets `archived_at = now()`. It NEVER deletes the row or
// touches orders, leads, consent, analytics, payments, or redemptions.
async function isOnlyNonArchivedActiveDrop(id: string): Promise<boolean> {
  // Active + not archived. If the column isn't migrated yet, we can't make
  // this determination — don't over-block, return false.
  const { data, error } = await adminDb
    .from("drop_items")
    .select("id")
    .eq("is_active", true)
    .is("archived_at", null);
  if (error || !data) return false;
  return data.length === 1 && data[0].id === id;
}

export async function archiveDrop(
  id: string,
  opts?: { confirmedImpact?: boolean },
): Promise<ArchiveResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const confirmedImpact = opts?.confirmedImpact === true;

  // Re-fetch FRESH state on every call — never trust a previous result.
  const { data: row, error: fetchErr } = await adminDb
    .from("drop_items")
    .select(`${DB_SELECT_COLS}, archived_at`)
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    if (isMissingArchivedColumn(fetchErr)) {
      return { ok: false, error: "Archive is not available yet — apply migration-007 first." };
    }
    return { ok: false, error: "Drop not found" };
  }
  if (!row) return { ok: false, error: "Drop not found" };

  // Already archived → idempotent no-op.
  if ((row as { archived_at?: string | null }).archived_at) {
    return { ok: true, noop: true };
  }

  // Compute window inputs via the LIVE status engine (no copied math).
  const item = dbRowToDropItem(row as Parameters<typeof dbRowToDropItem>[0]);
  const orderingOpen = canPurchase(item);
  const inPickup = isPickupInProgress(item);
  const isActive = (row as { is_active: boolean }).is_active === true;
  const isHero = (row as { is_hero: boolean }).is_hero === true;
  const onlyNonArchivedActive = isActive ? await isOnlyNonArchivedActiveDrop(id) : false;

  const decision = evaluateArchive({
    isHero,
    isActive,
    orderingOpen,
    inPickup,
    onlyNonArchivedActive,
    confirmedImpact,
  });

  if (decision.decision === "blocked") {
    return { ok: false, blocked: true, reason: decision.reason, message: decision.message };
  }
  if (decision.decision === "requires_confirmation") {
    return { ok: false, requiresConfirmation: true, message: decision.message };
  }

  // Archive: set the timestamp only. Leave is_active and every related
  // record untouched.
  const { error: updErr } = await adminDb
    .from("drop_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) {
    if (isMissingArchivedColumn(updErr)) {
      return { ok: false, error: "Archive is not available yet — apply migration-007 first." };
    }
    return { ok: false, error: "Could not archive drop" };
  }

  await logAdminAction(admin.email, "archive_drop", id, {
    archived_at: { before: null, after: "now" },
  });
  revalidatePath("/admin/drops");
  revalidatePath("/");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
// RESTAURANT — LIST / GET
// ═══════════════════════════════════════════════════════════════════════
export async function listRestaurants(): Promise<ActionResult<Restaurant[]>> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data, error } = await adminDb
    .from("restaurants")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as Restaurant[] };
}

export async function getRestaurant(id: string): Promise<ActionResult<Restaurant>> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data, error } = await adminDb
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Restaurant not found" };
  return { ok: true, data: data as Restaurant };
}

/**
 * Minimal payload for the drop create form's restaurant dropdown.
 * Returns only `is_active = true` rows.
 */
export async function getActiveRestaurantsForDropdown(): Promise<RestaurantOption[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const { data, error } = await adminDb
    .from("restaurants")
    .select("id, name, city, tags")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data as RestaurantOption[];
}

// ═══════════════════════════════════════════════════════════════════════
// RESTAURANT — CREATE
// ═══════════════════════════════════════════════════════════════════════
export async function createRestaurant(input: unknown): Promise<ActionResult<Restaurant>> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = restaurantCreateSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, error: "Validation failed", fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }

  const row: RestaurantCreateInput = {
    ...parsed.data,
    place_id: parsed.data.place_id ?? null,
  };

  const { data, error } = await adminDb
    .from("restaurants")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[createRestaurant] insert failed:", error.message);
    return { ok: false, error: "Could not create restaurant" };
  }

  await logAdminAction(admin.email, "create_restaurant", data.id, { after: data });
  revalidatePath("/admin/restaurants");
  revalidatePath("/admin/drops/new");
  return { ok: true, data: data as Restaurant };
}

// ═══════════════════════════════════════════════════════════════════════
// RESTAURANT — UPDATE
// ═══════════════════════════════════════════════════════════════════════
export async function updateRestaurant(id: string, input: unknown): Promise<ActionResult<Restaurant>> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = restaurantUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return { ok: false, error: "Validation failed", fieldErrors: flat.fieldErrors as Record<string, string[]> };
  }

  const { data: current, error: fetchErr } = await adminDb
    .from("restaurants")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !current) {
    return { ok: false, error: "Restaurant not found" };
  }

  const nextRow: RestaurantUpdateInput = {
    ...parsed.data,
    place_id: parsed.data.place_id ?? null,
  };

  const changes = diffFields(current as Record<string, unknown>, nextRow as Record<string, unknown>);
  if (Object.keys(changes).length === 0) {
    return { ok: true, data: current as Restaurant, noop: true };
  }

  const { data, error } = await adminDb
    .from("restaurants")
    .update(nextRow)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return { ok: false, error: "Could not update restaurant" };
  }

  await logAdminAction(admin.email, "update_restaurant", id, changes);
  revalidatePath("/admin/restaurants");
  revalidatePath(`/admin/restaurants/${id}/edit`);
  revalidatePath("/admin/drops/new");
  return { ok: true, data: data as Restaurant };
}

// ═══════════════════════════════════════════════════════════════════════
// RESTAURANT — TOGGLE is_active
// ═══════════════════════════════════════════════════════════════════════
export async function toggleRestaurantActive(id: string): Promise<ActionResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: current, error: fetchErr } = await adminDb
    .from("restaurants")
    .select("is_active")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !current) {
    return { ok: false, error: "Restaurant not found" };
  }

  const newValue = !current.is_active;
  const { error } = await adminDb
    .from("restaurants")
    .update({ is_active: newValue })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not toggle" };

  await logAdminAction(admin.email, "toggle_restaurant_active", id, {
    is_active: { before: current.is_active, after: newValue },
  });
  revalidatePath("/admin/restaurants");
  revalidatePath("/admin/drops/new");
  return { ok: true };
}
