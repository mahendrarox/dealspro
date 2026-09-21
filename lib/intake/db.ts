import { adminDb } from "@/lib/supabase-admin";
import { resolveSlugCollision } from "@/lib/slug";
import { suggestDropSlug } from "@/app/admin/drops/form-utils";
import type { IntakeDraft } from "./schemas";

/**
 * Data layer for `drop_submissions`.
 *
 * Every function here goes through the service-role client, and every
 * caller has already passed either `verifyIntakeToken()` (restaurant) or
 * `requireAdmin()` (operator). The table itself is RLS-on with no
 * policies, so there is no second way in.
 *
 * Nothing in this file reads or writes `drop_items` except:
 *   * `generateUniqueDropId`, which READS existing ids to avoid a
 *     collision, and
 *   * `markSubmissionPublished`, which records a drop id the operator's
 *     publish already created.
 * No function here ever creates, updates, or deletes a drop.
 */

export type SubmissionStatus = "submitted" | "published" | "rejected";

export type DropSubmission = {
  id: string;
  restaurant_id: string;
  status: SubmissionStatus;
  raw_message: string;
  draft: IntakeDraft;
  image_url: string;
  image_source: "upload" | "reuse";
  image_provenance: Record<string, unknown>;
  photo_attestation: boolean;
  attested_at: string | null;
  idempotency_key: string;
  published_drop_id: string | null;
  intake_token_jti: string;
  intake_token_issued_at: string | null;
  intake_token_expires_at: string | null;
  intake_session_id: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  reviewed_at: string | null;
};

export const SUBMISSION_SELECT_COLS =
  "id, restaurant_id, status, raw_message, draft, image_url, image_source, image_provenance, photo_attestation, attested_at, idempotency_key, published_drop_id, intake_token_jti, intake_token_issued_at, intake_token_expires_at, intake_session_id, reviewed_by, review_note, created_at, updated_at, submitted_at, reviewed_at";

/**
 * True when the error means migration-009 has not been applied yet.
 * Mirrors `isMissingArchivedColumn` in lib/drops/db.ts so a code deploy
 * that lands before the migration degrades to a clear message instead of
 * a stack trace.
 */
export function isMissingSubmissionsTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    /drop_submissions/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? "")
  );
}

export const MIGRATION_REQUIRED_MESSAGE =
  "Restaurant intake is not available yet — apply migration-009-drop-submissions.sql.";

// ═══════════════════════════════════════════════════════════════════════
// WRITE — idempotent insert
// ═══════════════════════════════════════════════════════════════════════

export type NewSubmission = {
  restaurant_id: string;
  raw_message: string;
  draft: IntakeDraft;
  image_url: string;
  image_source: "upload" | "reuse";
  image_provenance: Record<string, unknown>;
  idempotency_key: string;
  intake_token_jti: string;
  intake_token_issued_at: string | null;
  intake_token_expires_at: string | null;
  intake_session_id: string | null;
};

export type InsertResult =
  | { ok: true; submission: DropSubmission; duplicate: boolean }
  | { ok: false; error: string; migrationMissing?: boolean };

/**
 * Insert one submission, idempotently.
 *
 * The unique index on (restaurant_id, idempotency_key) is the real
 * guarantee. A double-tap, a retry, or two concurrent requests all end
 * with exactly one row: whichever insert loses the race gets 23505 and
 * we return the row that won, so the restaurant sees a successful
 * submission either way rather than a confusing error.
 */
export async function insertSubmission(input: NewSubmission): Promise<InsertResult> {
  const row = {
    ...input,
    status: "submitted" as const,
    photo_attestation: true,
    attested_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
  };

  const { data, error } = await adminDb
    .from("drop_submissions")
    .insert(row)
    .select(SUBMISSION_SELECT_COLS)
    .single();

  if (!error && data) {
    return { ok: true, submission: data as DropSubmission, duplicate: false };
  }

  if (error && isMissingSubmissionsTable(error)) {
    return { ok: false, error: MIGRATION_REQUIRED_MESSAGE, migrationMissing: true };
  }

  if (error?.code === "23505") {
    const existing = await findSubmissionByIdempotencyKey(
      input.restaurant_id,
      input.idempotency_key,
    );
    if (existing) return { ok: true, submission: existing, duplicate: true };
  }

  console.error("[intake/db] insertSubmission failed:", error?.message);
  return { ok: false, error: "Could not save your submission" };
}

export async function findSubmissionByIdempotencyKey(
  restaurantId: string,
  idempotencyKey: string,
): Promise<DropSubmission | null> {
  const { data, error } = await adminDb
    .from("drop_submissions")
    .select(SUBMISSION_SELECT_COLS)
    .eq("restaurant_id", restaurantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as DropSubmission;
}

// ═══════════════════════════════════════════════════════════════════════
// READ — operator review queue
// ═══════════════════════════════════════════════════════════════════════

export type SubmissionWithRestaurant = DropSubmission & {
  restaurant_name: string;
  restaurant_city: string;
};

export async function listSubmissions(
  status?: SubmissionStatus,
): Promise<{ rows: SubmissionWithRestaurant[]; migrationMissing: boolean }> {
  let query = adminDb
    .from("drop_submissions")
    .select(`${SUBMISSION_SELECT_COLS}, restaurants ( name, city )`)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    if (isMissingSubmissionsTable(error)) return { rows: [], migrationMissing: true };
    console.error("[intake/db] listSubmissions failed:", error.message);
    return { rows: [], migrationMissing: false };
  }

  const rows = (data ?? []).map((r) => {
    const joined = (r as { restaurants?: { name?: string; city?: string } | null }).restaurants;
    return {
      ...(r as DropSubmission),
      restaurant_name: joined?.name ?? "(unknown restaurant)",
      restaurant_city: joined?.city ?? "",
    } as SubmissionWithRestaurant;
  });

  return { rows, migrationMissing: false };
}

export async function getSubmission(
  id: string,
): Promise<{ row: SubmissionWithRestaurant | null; migrationMissing: boolean }> {
  const { data, error } = await adminDb
    .from("drop_submissions")
    .select(`${SUBMISSION_SELECT_COLS}, restaurants ( name, city )`)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingSubmissionsTable(error)) return { row: null, migrationMissing: true };
    console.error("[intake/db] getSubmission failed:", error.message);
    return { row: null, migrationMissing: false };
  }
  if (!data) return { row: null, migrationMissing: false };

  const joined = (data as { restaurants?: { name?: string; city?: string } | null }).restaurants;
  return {
    row: {
      ...(data as DropSubmission),
      restaurant_name: joined?.name ?? "(unknown restaurant)",
      restaurant_city: joined?.city ?? "",
    } as SubmissionWithRestaurant,
    migrationMissing: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// WRITE — review outcomes
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record that an operator published this submission.
 *
 * Called AFTER `createDrop()` has already created the drop. It only ever
 * writes to `drop_submissions`; the published drop row is never touched
 * again by intake code, which is what keeps a repeat drop immutable.
 *
 * The `.eq("status", "submitted")` guard makes a double-publish a no-op
 * at the database level rather than silently re-pointing an already
 * published submission at a second drop.
 */
export async function markSubmissionPublished(
  id: string,
  dropId: string,
  adminEmail: string,
): Promise<boolean> {
  const { data, error } = await adminDb
    .from("drop_submissions")
    .update({
      status: "published",
      published_drop_id: dropId,
      reviewed_by: adminEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id");

  if (error) {
    console.error("[intake/db] markSubmissionPublished failed:", error.message);
    return false;
  }
  return (data ?? []).length === 1;
}

export async function markSubmissionRejected(
  id: string,
  adminEmail: string,
  note: string | null,
): Promise<boolean> {
  const { error } = await adminDb
    .from("drop_submissions")
    .update({
      status: "rejected",
      reviewed_by: adminEmail,
      reviewed_at: new Date().toISOString(),
      review_note: note,
    })
    .eq("id", id)
    .eq("status", "submitted");

  if (error) {
    console.error("[intake/db] markSubmissionRejected failed:", error.message);
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// Drop id generation for the review form
// ═══════════════════════════════════════════════════════════════════════

/**
 * A collision-free drop id for a submission the operator is about to
 * publish.
 *
 * A repeat drop — same restaurant, same dish, same day — produces the
 * same base slug as last time. `createDrop()` would reject that as a
 * duplicate primary key, which is the right backstop but a poor
 * experience for an entirely legitimate second offering. Resolving the
 * collision here (base, base-2, base-3, …, via the same
 * `resolveSlugCollision` the restaurant slug path uses) means the repeat
 * gets its OWN id and therefore its own URL, while the previous drop row
 * is left exactly as it was.
 *
 * This runs when the review form is PREFILLED. `createDrop()` keeps its
 * existing duplicate-id behaviour untouched — manual Studio creation is
 * unchanged, and the PK remains the final guarantee against a race.
 */
export async function generateUniqueDropId(opts: {
  restaurantName: string;
  title: string;
  startTimeLocal: string;
}): Promise<string> {
  const base = suggestDropSlug(opts) || "drop";
  const { data } = await adminDb.from("drop_items").select("id").like("id", `${base}%`);
  const taken = new Set((data ?? []).map((r) => (r as { id: string }).id));
  return resolveSlugCollision(base, taken);
}
