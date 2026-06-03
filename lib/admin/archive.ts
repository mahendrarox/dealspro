/**
 * Archive decision logic — pure and dependency-free so it can be unit
 * tested in isolation and shared between the server action and the UI.
 *
 * IMPORTANT: this module performs NO time/window math. The "ordering open"
 * and "in pickup window" inputs are computed by the caller using the live
 * status-engine helpers (`canPurchase` / `isPickupInProgress` from
 * `lib/drops/helpers`). This avoids a second copy of the timezone/window
 * comparison logic — the archive feature inherits whatever the live card
 * already does.
 */

export const ARCHIVE_MESSAGES = {
  /** Hero block — always wins. */
  featuredBlock:
    "This drop is currently featured. Set another drop as hero before archiving it.",
  /** Strong confirmation when the drop may affect the live storefront. */
  requiresConfirmation:
    "This drop may currently be visible to customers or affect the live storefront. Archiving it will remove it from public views. Continue?",
} as const;

export type ArchiveDecision =
  | { decision: "blocked"; reason: "featured_drop"; message: string }
  | { decision: "requires_confirmation"; message: string }
  | { decision: "archive" };

export type ArchiveImpactInputs = {
  /** drop_items.is_hero — hero/featured always blocks archive. */
  isHero: boolean;
  /** drop_items.is_active. */
  isActive: boolean;
  /** canPurchase(item): now < start_time_iso (ordering currently open). */
  orderingOpen: boolean;
  /** isPickupInProgress(item): start_time_iso <= now < end_time_iso. */
  inPickup: boolean;
  /** True if this is the only non-archived, active drop. */
  onlyNonArchivedActive: boolean;
  /** Whether the admin has explicitly confirmed the impact. */
  confirmedImpact: boolean;
};

/**
 * Decide what should happen when an admin tries to archive a drop.
 *
 * Order of precedence:
 *   1. Hero/featured → BLOCK (always wins, even with confirmedImpact).
 *   2. Any impact risk + not yet confirmed → REQUIRES_CONFIRMATION.
 *   3. Otherwise → ARCHIVE.
 *
 * The server MUST call this with FRESH inputs re-fetched on every request,
 * never trusting a previous call's result. Passing fresh inputs is what
 * makes the re-check correct: if a drop became hero between the first and
 * second call, the second call returns `blocked`.
 */
export function evaluateArchive(input: ArchiveImpactInputs): ArchiveDecision {
  // 1. Hero always wins.
  if (input.isHero) {
    return { decision: "blocked", reason: "featured_drop", message: ARCHIVE_MESSAGES.featuredBlock };
  }

  // 2. Combined impact predicate.
  const requiresImpactConfirmation =
    input.isActive || input.orderingOpen || input.inPickup || input.onlyNonArchivedActive;

  if (requiresImpactConfirmation && !input.confirmedImpact) {
    return { decision: "requires_confirmation", message: ARCHIVE_MESSAGES.requiresConfirmation };
  }

  // 3. Safe to archive.
  return { decision: "archive" };
}
