"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import { dropCreateSchema, dropUpdateSchema, type DropCreateInput, type DropUpdateInput } from "./schemas";
import { adminDb } from "@/lib/supabase-admin";
import { diffFields, logAdminAction } from "./log";

type ActionResult<T = unknown> =
  | { ok: true; data?: T; noop?: boolean }
  | { ok: false; error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Strip the form-only `location_mode` discriminator before persisting —
 * it's a client/server validation hint, not a DB column. Everything else
 * in the parsed schema maps 1:1 to a `drop_items` column.
 */
function toDbRow(parsed: DropCreateInput | DropUpdateInput) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { location_mode, ...rest } = parsed;
  return {
    ...rest,
    image_url: rest.image_url || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════
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

  const row = toDbRow(parsed.data);

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
// UPDATE (idempotent: diff before writing)
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

  const nextRow = toDbRow(parsed.data);

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
// TOGGLE is_active
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
// TOGGLE is_hero — single-hero invariant enforced by set_hero_drop RPC
// (atomic at DB level) + idx_single_hero partial unique index (defense in depth)
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
    // Setting to true: use atomic RPC that unflags any existing hero
    // and flags the target row in a single transaction.
    const { error: rpcErr } = await adminDb.rpc("set_hero_drop", { target_id: id });
    if (rpcErr) {
      console.error("[toggleHero] set_hero_drop RPC failed:", rpcErr.message);
      return { ok: false, error: "Could not set hero" };
    }
  } else {
    // Setting to false: simple targeted update; no RPC needed.
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
