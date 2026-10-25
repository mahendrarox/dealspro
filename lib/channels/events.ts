import { adminDb } from "@/lib/supabase-admin";
import { normalizeTag } from "@/lib/attribution/tag";

/**
 * Recording channel events: copies, visits, created checkout sessions.
 *
 * Server-only. Every input that can reach here from a browser is treated
 * as hostile: shapes are validated, lengths are bounded, and anything
 * that does not match is dropped rather than stored.
 *
 * THE CARDINAL RULE: recording must never break the thing it measures.
 * Every function here swallows its own failures and returns a boolean.
 * A tracking table that is missing, full, slow or revoked must not cost
 * a customer their checkout.
 *
 * NOTHING identifying is stored. No phone, no qr_token, no payment
 * secret, no IP, no user agent. A row is: what kind of event, which
 * drop, which tag, and a key that makes a retry a no-op.
 */

export type ChannelEventType = "copy" | "visit" | "checkout_session";

/** Beacon ids from the browser. Bounded and shape-checked. */
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Stripe session ids. `cs_test_…` / `cs_live_…`. */
const SESSION_ID_RE = /^[A-Za-z0-9_]{8,120}$/;

const MAX_DROP_ID = 200;

/** Postgres unique_violation — a duplicate beacon, which is success. */
const UNIQUE_VIOLATION = "23505";

/** The table is absent (migration-013 not applied) — degrade, never throw. */
export function isMissingEventsTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return false; // undefined_column, not table
  return (
    error.code === "42P01" ||
    /channel_events|share_channels|channel_instrumentation/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? "")
  );
}

function safeDropId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_DROP_ID) return null;
  return trimmed;
}

/**
 * Insert one event, or quietly do nothing.
 *
 * Returns true when a NEW row landed. A duplicate dedupe_key returns
 * false — the caller already counted, and that is the point: a retried
 * beacon, a double-fired effect or a replayed request cannot inflate a
 * count.
 */
async function record(
  eventType: ChannelEventType,
  dedupeKey: string,
  dropItemId: string | null,
  tag: string | null,
): Promise<boolean> {
  try {
    const { error } = await adminDb.from("channel_events").insert({
      event_type: eventType,
      drop_item_id: dropItemId,
      tag,
      dedupe_key: dedupeKey,
    });

    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false; // already counted
    if (isMissingEventsTable(error)) return false; // migration-013 pending
    console.error("[channels/events] insert failed:", error.message);
    return false;
  } catch (err) {
    console.error(
      "[channels/events] insert threw:",
      err instanceof Error ? err.message : "unknown error",
    );
    return false;
  }
}

/**
 * An operator's clipboard write succeeded.
 *
 * NOT evidence the link was sent to anybody. Recorded because an
 * operator asking "did I ever share this channel?" deserves an answer,
 * and that is the only question it answers.
 */
export async function recordCopy(opts: {
  dropItemId: string;
  tag: string | null;
  clientEventId: string;
}): Promise<boolean> {
  const dropId = safeDropId(opts.dropItemId);
  if (!dropId) return false;
  if (!CLIENT_ID_RE.test(opts.clientEventId ?? "")) return false;
  return record("copy", `copy:${opts.clientEventId}`, dropId, normalizeTag(opts.tag));
}

/**
 * A customer drop page actually rendered in a browser.
 *
 * Fired from a client effect, never from the server render, so a
 * prefetch, a crawler fetch or a server-side render does not count as a
 * visit. It is a page view: not a unique person, not reach.
 */
export async function recordVisit(opts: {
  dropItemId: string;
  tag: string | null;
  clientEventId: string;
}): Promise<boolean> {
  const dropId = safeDropId(opts.dropItemId);
  if (!dropId) return false;
  if (!CLIENT_ID_RE.test(opts.clientEventId ?? "")) return false;
  return record("visit", `visit:${opts.clientEventId}`, dropId, normalizeTag(opts.tag));
}

/**
 * Stripe successfully created a Checkout Session.
 *
 * Keyed on the session id, so the same session can never be counted
 * twice however many times the route is retried. NOT a payment: the
 * customer may never pay.
 */
export async function recordCheckoutSession(opts: {
  dropItemId: string;
  tag: string | null;
  sessionId: string;
}): Promise<boolean> {
  const dropId = safeDropId(opts.dropItemId);
  if (!dropId) return false;
  if (!SESSION_ID_RE.test(opts.sessionId ?? "")) return false;
  return record("checkout_session", `checkout:${opts.sessionId}`, dropId, normalizeTag(opts.tag));
}

/**
 * When measurement began, or null if it has not.
 *
 * Null means the migration has not been applied, and the UI must say
 * "not tracked" rather than render an absent past as zero.
 */
export async function instrumentationStartedAt(): Promise<Date | null> {
  try {
    const { data, error } = await adminDb
      .from("channel_instrumentation")
      .select("started_at")
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const parsed = new Date((data as { started_at: string }).started_at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}
