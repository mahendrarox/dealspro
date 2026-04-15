"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import { dropCreateSchema, dropUpdateSchema } from "./schemas";
import { adminDb } from "@/lib/supabase-admin";
import { diffFields, logAdminAction } from "./log";

type ActionResult<T = unknown> =
  | { ok: true; data?: T; noop?: boolean }
  | { ok: false; error?: string; fieldErrors?: Record<string, string[]> };

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

  const row = {
    ...parsed.data,
    image_url: parsed.data.image_url || null,
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

  const nextRow = {
    ...parsed.data,
    image_url: parsed.data.image_url || null,
  };

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
// TOGGLE is_hero
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
  const { error } = await adminDb
    .from("drop_items")
    .update({ is_hero: newValue })
    .eq("id", id);

  if (error) return { ok: false, error: "Could not toggle" };

  await logAdminAction(admin.email, "toggle_hero", id, {
    is_hero: { before: current.is_hero, after: newValue },
  });
  revalidatePath("/admin/drops");
  revalidatePath("/");
  return { ok: true };
}
