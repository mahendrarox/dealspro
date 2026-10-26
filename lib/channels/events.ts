import { adminDb } from "@/lib/supabase-admin";
import { normalizeTag } from "@/lib/attribution/tag";
import { bounded, EVENT_WRITE_TIMEOUT_MS } from "@/lib/channels/bounded";

/**
 * Recording channel events: copies, visits, created checkout sessions.
 *
 * Server-only. Every input that can reach here from a browser is treated
 * as hostile: shapes are validated, lengths are bounded, and anything
 * that does not match is dropped rather than stored.
 *
 * THE CARDINAL RULE: recording must never break the thing it measures,
 * and must never hold it up either. Every function here swallows its own
 * failures AND abandons the wait at a deadline, returning a boolean. A
 * tracking table that is missing, full, revoked or simply slow must not
 * cost a customer their checkout or add visible latency to it.
 *
 * Swallowing errors alone would not achieve the second half: a write
 * that hangs never throws. The deadline lives in lib/channels/bounded.
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

/**
 * migration-013 is not applied — degrade, never throw.
 *
 * PGRST202 is included because the migration also installs two
 * functions: when it is missing, PostgREST cannot resolve them by name
 * and reports that rather than a missing relation. Treating it as
 * anything but "migration pending" would log an error storm on every
 * page view of an un-migrated deploy.
 */
export function isMissingEventsTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return false; // undefined_column, not table
  return (
    error.code === "42P01" ||
    error.code === "PGRST202" || // function not in the schema cache
    /record_channel_event|channel_tags_in_use/i.test(error.message ?? "") ||
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
  timeoutMs: number = EVENT_WRITE_TIMEOUT_MS,
): Promise<boolean> {
  // One RPC, one transaction: the insert and the initialization of
  // first_event_at commit together. Two round trips could leave a
  // recorded event with no recorded start if the second were lost.
  const outcome = await bounded(
    (signal) =>
      adminDb
        .rpc("record_channel_event", {
          p_event_type: eventType,
          p_drop_item_id: dropItemId,
          p_tag: tag,
          p_dedupe_key: dedupeKey,
        })
        .abortSignal(signal),
    timeoutMs,
  );

  if (outcome.status === "timeout") {
    // The statement may still land — it is idempotent under the dedupe
    // key — but nothing waits for it. A count we may have lost is a far
    // smaller harm than a checkout we delayed.
    console.error(
      `[channels/events] ${eventType} write exceeded ${timeoutMs}ms; abandoned`,
    );
    return false;
  }

  if (outcome.status === "error") {
    const err = outcome.error;
    console.error(
      "[channels/events] rpc threw:",
      err instanceof Error ? err.message : "unknown error",
    );
    return false;
  }

  const { data, error } = outcome.value;
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false; // already counted
    if (isMissingEventsTable(error)) return false; // migration-013 pending
    console.error("[channels/events] rpc failed:", error.message);
    return false;
  }

  // 'recorded' | 'duplicate'. A duplicate is success for the caller and
  // a no-op for the count, which is the entire point of the dedupe key.
  return data === "recorded";
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
 * The first copy, visit or checkout session actually RECORDED, or null.
 *
 * Deliberately NOT "when tracking started" and NOT "when the code
 * deployed". Neither is observable from here, and the earlier version of
 * this feature claimed the migration's apply time was both — which
 * presented every hour between applying the SQL and deploying the code
 * as measured and empty.
 *
 * Null has two meanings, and the caller distinguishes them by whether
 * the events table exists at all: migration not applied (not tracked),
 * or applied with nothing recorded yet (tracking, no activity). Neither
 * is zero activity over a known window.
 */
export async function firstRecordedActivityAt(): Promise<Date | null> {
  const outcome = await bounded((signal) =>
    adminDb
      .from("channel_instrumentation")
      .select("first_event_at")
      .limit(1)
      .abortSignal(signal)
      .maybeSingle(),
  );
  if (outcome.status !== "ok") return null;

  const { data, error } = outcome.value;
  if (error || !data) return null;
  const raw = (data as { first_event_at: string | null }).first_event_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
