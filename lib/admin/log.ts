import { adminDb } from "@/lib/supabase-admin";

export type AdminAction =
  | "create_drop"
  | "update_drop"
  | "toggle_active"
  | "toggle_hero"
  | "create_restaurant"
  | "update_restaurant"
  | "toggle_restaurant_active";

/**
 * Append an admin log row. Fails silently so a logging error does not
 * block the primary mutation. Production errors go to server logs.
 */
export async function logAdminAction(
  adminEmail: string,
  action: AdminAction,
  dropId: string | null,
  changes: Record<string, unknown> | null,
): Promise<void> {
  try {
    await adminDb.from("admin_logs").insert({
      action,
      drop_id: dropId,
      changes: changes ?? null,
      admin_email: adminEmail,
    });
  } catch (err) {
    console.error("[admin-log] failed to write:", err);
  }
}

/**
 * Diff two objects field by field. Returns an object of { field: { before, after } }
 * for every field that changed. Used to build idempotent update logs.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    const b = before[key];
    const a = after[key];
    // Normalize nulls and compare
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) {
      changes[key] = { before: b ?? null, after: a ?? null };
    }
  }
  return changes;
}
