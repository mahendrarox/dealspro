"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/log";
import { adminDb } from "@/lib/supabase-admin";
import { signIntakeToken, INTAKE_TOKEN_TTL_SECONDS } from "./token";
import { markSubmissionPublished, markSubmissionRejected } from "./db";

/**
 * Operator-side actions for restaurant intake. Every one of these starts
 * with `requireAdmin()` — the same guard the rest of Studio uses.
 *
 * Note what is NOT here: publishing. Publishing goes through the
 * existing `createDrop()` server action, unchanged, from the existing
 * Studio drop form. This module only records the link between a
 * submission and the drop that `createDrop()` already created.
 */

export type LinkResult =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; error: string };

/**
 * Mint a private intake link for one restaurant.
 *
 * Minting is itself an audited admin action: the log records who created
 * a credential for which partner, and the token's `jti` ties any
 * resulting submission back to this exact link.
 */
export async function createIntakeLink(restaurantId: string): Promise<LinkResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: restaurant, error } = await adminDb
    .from("restaurants")
    .select("id, name, is_active")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error || !restaurant) return { ok: false, error: "Restaurant not found" };
  if (!restaurant.is_active) {
    return { ok: false, error: "This restaurant is inactive — activate it before sharing a link" };
  }

  let token: string;
  let jti: string;
  let expiresAt: Date;
  try {
    ({ token, jti, expiresAt } = await signIntakeToken(restaurant.id));
  } catch (err) {
    console.error("[intake/admin] sign failed:", err instanceof Error ? err.message : err);
    return {
      ok: false,
      error: "INTAKE_JWT_SECRET is not configured (min 32 chars, and different from ADMIN_JWT_SECRET)",
    };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
  const url = `${base}/intake/${token}`;

  // The raw token is deliberately NOT logged — only its id, so the audit
  // trail can identify the link without being able to replay it.
  await logAdminAction(admin.email, "create_intake_link", restaurant.id, {
    restaurant_name: restaurant.name,
    token_jti: jti,
    ttl_seconds: INTAKE_TOKEN_TTL_SECONDS,
    expires_at: expiresAt.toISOString(),
  });

  return { ok: true, url, expiresAt: expiresAt.toISOString() };
}

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Record that a published drop came from a submission.
 *
 * Called by the Studio drop form immediately after `createDrop()`
 * succeeds. Failing to link is not failing to publish — the drop is
 * already live and correct — so the caller surfaces a warning rather
 * than implying the publish failed.
 */
export async function linkPublishedSubmission(
  submissionId: string,
  dropId: string,
): Promise<ReviewResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const linked = await markSubmissionPublished(submissionId, dropId, admin.email);
  if (!linked) {
    return { ok: false, error: "Drop published, but the submission was already reviewed" };
  }

  await logAdminAction(admin.email, "publish_submission", dropId, {
    submission_id: submissionId,
  });

  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${submissionId}`);
  return { ok: true };
}

export async function rejectSubmission(
  submissionId: string,
  note: string,
): Promise<ReviewResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const trimmed = note.trim().slice(0, 500);
  const done = await markSubmissionRejected(submissionId, admin.email, trimmed || null);
  if (!done) return { ok: false, error: "Could not reject this submission" };

  await logAdminAction(admin.email, "reject_submission", null, {
    submission_id: submissionId,
    note: trimmed,
  });

  revalidatePath("/admin/submissions");
  revalidatePath(`/admin/submissions/${submissionId}`);
  return { ok: true };
}
