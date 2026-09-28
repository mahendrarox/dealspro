"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/log";
import { adminDb } from "@/lib/supabase-admin";
import {
  canRevealLink,
  createLink,
  listLinksForRestaurant,
  linkStatus,
  markReplacedBy,
  revealLinkCode,
  revokeAllForRestaurant,
  revokeLink,
  setLegacyCutoff,
  INTAKE_LINK_TTL_DAYS,
  type LinkStatus,
} from "./links";
import { isLinkCryptoConfigured } from "./link-crypto";
import { markSubmissionPublished, markSubmissionRejected } from "./db";

/**
 * Operator-side actions for restaurant intake. Every one starts with
 * `requireAdmin()` — the same guard as the rest of Studio.
 *
 * Note what is NOT here: publishing. Publishing goes through the
 * existing `createDrop()` server action, unchanged, from the existing
 * Studio drop form. This module only mints and manages intake links and
 * records review outcomes.
 */

export type MintedLink = {
  /** Full URL. */
  url: string;
  /** First few characters, safe to display later to identify the link. */
  prefix: string;
  expiresAt: string;
};

/** Build the shareable URL. The only place the two halves are joined. */
function linkUrl(code: string): string {
  return `${appBase()}/i/${code}`;
}

export type LinkResult = { ok: true; link: MintedLink } | { ok: false; error: string };

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
}

async function assertActiveRestaurant(
  restaurantId: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { data, error } = await adminDb
    .from("restaurants")
    .select("id, name, is_active")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "Restaurant not found" };
  if (!data.is_active) {
    return { ok: false, error: "This restaurant is inactive — activate it before sharing a link" };
  }
  return { ok: true, name: data.name as string };
}

/**
 * Mint a short private intake link.
 *
 * The code is returned here AND stored encrypted, so an admin can copy
 * the same URL again later via `revealIntakeLink`. Only the SHA-256 is
 * used for validation. With no encryption key configured the link is
 * still minted, hash-only, and can only be re-shared by replacing it.
 */
export async function createIntakeLink(restaurantId: string): Promise<LinkResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const restaurant = await assertActiveRestaurant(restaurantId);
  if (!restaurant.ok) return { ok: false, error: restaurant.error };

  const created = await createLink({ restaurantId, createdBy: admin.email });
  if (!created.ok) return { ok: false, error: created.error };

  // The code never reaches the audit log — only the row id that
  // identifies it. A log that contained the code would be a log that
  // grants access.
  await logAdminAction(admin.email, "create_intake_link", restaurantId, {
    restaurant_name: restaurant.name,
    intake_link_id: created.link.id,
    code_prefix: created.link.code_prefix,
    ttl_days: INTAKE_LINK_TTL_DAYS,
    expires_at: created.link.expires_at,
  });

  revalidatePath("/admin/restaurants");
  return {
    ok: true,
    link: {
      url: linkUrl(created.code),
      prefix: created.link.code_prefix,
      expiresAt: created.link.expires_at,
    },
  };
}

/**
 * Revoke every live link for a restaurant and mint a fresh one.
 *
 * The order matters: revoke first, then create. If the create fails, the
 * partner is left with no working link rather than an old one the
 * operator believes they replaced.
 */
export async function replaceIntakeLink(restaurantId: string): Promise<LinkResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const restaurant = await assertActiveRestaurant(restaurantId);
  if (!restaurant.ok) return { ok: false, error: restaurant.error };

  const { rows: before } = await listLinksForRestaurant(restaurantId);
  const liveIds = before.filter((l) => linkStatus(l) === "active").map((l) => l.id);

  const revoked = await revokeAllForRestaurant({
    restaurantId,
    revokedBy: admin.email,
    reason: "replaced",
  });
  if (!revoked.ok) return { ok: false, error: revoked.error };

  // Close the OTHER credential family too. A legacy JWT has no row to
  // revoke, so "Replace" would otherwise leave the partner's old
  // /intake/<token> link working — which would make this button a lie.
  const legacyClosed = await setLegacyCutoff({ restaurantId, setBy: admin.email });

  const created = await createLink({ restaurantId, createdBy: admin.email });
  if (!created.ok) {
    return {
      ok: false,
      error: `${created.error} The previous link(s) have already been revoked — retry to issue a new one.`,
    };
  }

  await markReplacedBy(liveIds, created.link.id);

  await logAdminAction(admin.email, "replace_intake_link", restaurantId, {
    restaurant_name: restaurant.name,
    revoked_count: revoked.revoked,
    legacy_jwt_cutoff_set: legacyClosed,
    new_intake_link_id: created.link.id,
    code_prefix: created.link.code_prefix,
    expires_at: created.link.expires_at,
  });

  revalidatePath("/admin/restaurants");
  return {
    ok: true,
    link: {
      url: linkUrl(created.code),
      prefix: created.link.code_prefix,
      expiresAt: created.link.expires_at,
    },
  };
}

export type RevokeActionResult = { ok: true; revoked: number } | { ok: false; error: string };

/** Revoke one link. Takes effect on the partner's next request. */
export async function revokeIntakeLink(
  linkId: string,
  restaurantId: string,
): Promise<RevokeActionResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  // restaurantId is passed as a guard so a malformed call cannot revoke
  // a link belonging to a different partner.
  const result = await revokeLink({
    linkId,
    restaurantId,
    revokedBy: admin.email,
    reason: "revoked by operator",
  });
  if (!result.ok) return result;

  await logAdminAction(admin.email, "revoke_intake_link", restaurantId, {
    intake_link_id: linkId,
    revoked_count: result.revoked,
  });

  revalidatePath("/admin/restaurants");
  return result;
}

/** Revoke every live link for a restaurant without issuing a new one. */
export async function revokeAllIntakeLinks(
  restaurantId: string,
): Promise<RevokeActionResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const result = await revokeAllForRestaurant({
    restaurantId,
    revokedBy: admin.email,
    reason: "revoked by operator",
  });
  if (!result.ok) return result;

  // Same reasoning as replaceIntakeLink: "Revoke all" must mean all.
  const legacyClosed = await setLegacyCutoff({ restaurantId, setBy: admin.email });

  await logAdminAction(admin.email, "revoke_intake_link", restaurantId, {
    scope: "all",
    revoked_count: result.revoked,
    legacy_jwt_cutoff_set: legacyClosed,
  });

  revalidatePath("/admin/restaurants");
  return result;
}

export type LinkSummary = {
  id: string;
  prefix: string;
  status: LinkStatus;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  useCount: number;
  wasReplaced: boolean;
  /**
   * Whether Copy/Open can work for this row. False for revoked, expired
   * and hash-only legacy links — the UI uses it to disable the buttons
   * rather than offering an action that would fail.
   */
  canCopy: boolean;
  /**
   * True only for an ACTIVE link that has no ciphertext: the one case
   * where a deliberate Replace would make copying possible. Expired and
   * revoked rows are not offered a replacement prompt, because replacing
   * is not what they need.
   */
  needsReplacementToCopy: boolean;
};

export type ListLinksResult =
  | {
      ok: true;
      links: LinkSummary[];
      migrationMissing: boolean;
      /** False when INTAKE_LINK_ENC_KEY is unset, so Studio can say why. */
      cryptoConfigured: boolean;
    }
  | { ok: false; error: string };

/**
 * Links for one restaurant, for the Studio row.
 *
 * Returns no code and no hash — only what an operator needs to decide
 * whether to revoke or replace.
 */
export async function listIntakeLinks(restaurantId: string): Promise<ListLinksResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { rows, migrationMissing } = await listLinksForRestaurant(restaurantId);
  const cryptoConfigured = isLinkCryptoConfigured();

  return {
    ok: true,
    migrationMissing,
    cryptoConfigured,
    links: rows.map((l) => {
      const status = linkStatus(l);
      return {
        id: l.id,
        prefix: l.code_prefix,
        status,
        expiresAt: l.expires_at,
        createdAt: l.created_at,
        createdBy: l.created_by,
        lastUsedAt: l.last_used_at ?? null,
        // The column is NOT NULL DEFAULT 0, but guard anyway so a row that
        // predates the default can never render a blank count.
        useCount: l.use_count ?? 0,
        wasReplaced: Boolean(l.replaced_by),
        // Note what is NOT here: the ciphertext. Whether a code can be
        // recovered is a boolean to the browser; the envelope itself
        // never leaves the server.
        canCopy: canRevealLink(l),
        needsReplacementToCopy: status === "active" && !l.code_encrypted,
      };
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════

export type RevealResult =
  | { ok: true; url: string; prefix: string; expiresAt: string }
  | { ok: false; error: string; needsReplacement?: boolean };

/**
 * Hand an authenticated admin the URL of an existing ACTIVE link.
 *
 * This is the whole point of the ciphertext: an operator who refreshed
 * Studio, or came back the next day, can re-send the partner the SAME
 * link instead of replacing it — because replacing invalidates every
 * other credential that partner holds.
 *
 * What it must not do, and does not:
 *
 *   * mint a code — no call to `createLink` anywhere below;
 *   * extend expiry — `expires_at` is read, never written;
 *   * revoke anything — no write of any kind happens here;
 *   * count as usage — `touchLink` is for the partner opening the link,
 *     and an operator copying it is not the partner opening it;
 *   * log the code or the URL — the audit entry carries the row id and
 *     the public prefix, nothing that grants access.
 *
 * `restaurantId` is a guard, not a convenience: paired with the scoped
 * read in `getLinkById` it means a link id alone cannot reach across
 * partners, and the ciphertext's AAD enforces the same binding one layer
 * down.
 */
export async function revealIntakeLink(
  linkId: string,
  restaurantId: string,
): Promise<RevealResult> {
  // This response contains a live credential. Server Action responses are
  // POST and are not cached, but say so explicitly so that moving this to
  // any other transport later cannot silently make it cacheable.
  noStore();

  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const revealed = await revealLinkCode(linkId, restaurantId);
  if (!revealed.ok) {
    switch (revealed.reason) {
      case "revoked":
        return { ok: false, error: "This link was revoked — issue a new one." };
      case "expired":
        return { ok: false, error: "This link has expired — issue a new one." };
      case "legacy_no_ciphertext":
        return {
          ok: false,
          needsReplacement: true,
          error: "This older link needs a one-time replacement to enable copying.",
        };
      case "key_unavailable":
        return {
          ok: false,
          error: "Link retrieval is not configured on this server — set INTAKE_LINK_ENC_KEY.",
        };
      case "undecryptable":
        return {
          ok: false,
          needsReplacement: true,
          error: "This link's stored copy could not be read — replace it to issue a fresh one.",
        };
      default:
        return { ok: false, error: "That link was not found for this restaurant." };
    }
  }

  await logAdminAction(admin.email, "reveal_intake_link", restaurantId, {
    intake_link_id: revealed.link.id,
    code_prefix: revealed.link.code_prefix,
    expires_at: revealed.link.expires_at,
  });

  return {
    ok: true,
    url: linkUrl(revealed.code),
    prefix: revealed.link.code_prefix,
    expiresAt: revealed.link.expires_at,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// REVIEW OUTCOMES (unchanged)
// ═══════════════════════════════════════════════════════════════════════

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
