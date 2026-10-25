"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/log";
import { adminDb } from "@/lib/supabase-admin";
import { normalizeTag } from "@/lib/attribution/tag";
import { generateChannelCode, shareUrl } from "@/lib/channels/codes";
import {
  aggregateChannelResults,
  type ChannelResult,
  type EventRow,
  type OrderRow,
} from "@/lib/channels/aggregate";
import {
  CHANNELS_MIGRATION_REQUIRED,
  MAX_PAGES,
  PAGE_SIZE,
} from "@/lib/channels/constants";
import {
  instrumentationStartedAt,
  isMissingEventsTable,
  recordCopy,
} from "@/lib/channels/events";

/**
 * Studio sharing: the channel registry and per-channel results.
 *
 * Every exported action begins with `requireAdmin()`. Not one of them is
 * reachable without an admin session, and the registry is never exposed
 * on a public route — `middleware.ts` already gates `/admin/:path*`, and
 * these guards are the second, independent layer.
 *
 * Nothing here touches the payment path. Links are built from the
 * configured canonical origin; the drop, its price and its inventory are
 * untouched by which channel a link names.
 */



export type Channel = {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
  createdAt: string;
};

function appBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "";
}

function toChannel(row: Record<string, unknown>): Channel {
  return {
    id: String(row.id),
    code: String(row.code),
    label: String(row.label),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ""),
  };
}

const CHANNEL_COLS = "id, code, label, is_active, created_at";

/**
 * Read every matching row, not just PostgREST's first page.
 *
 * The default response is capped, and an aggregate built on a capped
 * read is silently wrong in exactly the direction that flatters it. This
 * walks `.range()` until a short page arrives.
 */
async function readAll<T>(
  table: string,
  columns: string,
  filterColumn: string,
  filterValue: string,
): Promise<{ rows: T[]; missingTable: boolean; error: string | null }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await adminDb
      .from(table)
      .select(columns)
      .eq(filterColumn, filterValue)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (isMissingEventsTable(error)) return { rows, missingTable: true, error: null };
      return { rows, missingTable: false, error: error.message };
    }
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return { rows, missingTable: false, error: null };
}

// ═══════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════

export type ListChannelsResult =
  | { ok: true; channels: Channel[]; migrationMissing: boolean }
  | { ok: false; error: string };

/** Every channel, active and retired. Admin only. */
export async function listChannels(): Promise<ListChannelsResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data, error } = await adminDb
    .from("share_channels")
    .select(CHANNEL_COLS)
    .order("is_active", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    if (isMissingEventsTable(error)) {
      return { ok: true, channels: [], migrationMissing: true };
    }
    console.error("[admin/channels] listChannels failed:", error.message);
    return { ok: false, error: "Could not load channels" };
  }

  return {
    ok: true,
    migrationMissing: false,
    channels: (data ?? []).map((r) => toChannel(r as Record<string, unknown>)),
  };
}

export type ChannelMutationResult =
  | { ok: true; channel: Channel }
  | { ok: false; error: string };

/**
 * Create a channel from a display name.
 *
 * The code is derived here and never shown as an editable field: an
 * operator types "Frisco WhatsApp" and gets `frisco-whatsapp`.
 * Collisions resolve to `-2`, `-3`, deterministically.
 *
 * The read-then-resolve is racy by nature, so the unique index is the
 * real guarantee: a lost race surfaces as 23505 and is retried once
 * against the newly-taken set.
 */
export async function createChannel(label: string): Promise<ChannelMutationResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const trimmed = (label ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a name for this channel" };
  if (trimmed.length > 120) return { ok: false, error: "That name is too long (120 characters max)" };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await adminDb.from("share_channels").select("code");
    if (existing.error) {
      if (isMissingEventsTable(existing.error)) {
        return { ok: false, error: CHANNELS_MIGRATION_REQUIRED };
      }
      return { ok: false, error: "Could not load existing channels" };
    }

    const taken = (existing.data ?? []).map((r) => String((r as { code: string }).code));
    const code = generateChannelCode(trimmed, taken);
    if (!code) {
      return { ok: false, error: "Could not derive a link code from that name" };
    }

    const { data, error } = await adminDb
      .from("share_channels")
      .insert({ code, label: trimmed, created_by: admin.email })
      .select(CHANNEL_COLS)
      .single();

    if (!error && data) {
      await logAdminAction(admin.email, "create_share_channel", null, {
        channel_code: code,
        channel_label: trimmed,
      });
      revalidatePath("/admin/drops");
      return { ok: true, channel: toChannel(data as Record<string, unknown>) };
    }
    if (error && isMissingEventsTable(error)) {
      return { ok: false, error: CHANNELS_MIGRATION_REQUIRED };
    }
    if (error?.code !== "23505") {
      console.error("[admin/channels] createChannel failed:", error?.message);
      return { ok: false, error: "Could not create that channel" };
    }
    // 23505 → someone took the code between the read and the insert.
  }

  return { ok: false, error: "Could not create that channel — try a different name" };
}

/**
 * Rename a channel.
 *
 * Updates `label` and NOTHING else. The code is never part of the
 * update, so every link already copied and every order already
 * attributed stay pointed at the same channel. This is the single most
 * important invariant in the feature.
 */
export async function renameChannel(
  channelId: string,
  label: string,
): Promise<ChannelMutationResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const trimmed = (label ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a name for this channel" };
  if (trimmed.length > 120) return { ok: false, error: "That name is too long (120 characters max)" };

  const { data, error } = await adminDb
    .from("share_channels")
    .update({ label: trimmed }) // code is deliberately absent
    .eq("id", channelId)
    .select(CHANNEL_COLS)
    .single();

  if (error || !data) {
    if (error && isMissingEventsTable(error)) {
      return { ok: false, error: CHANNELS_MIGRATION_REQUIRED };
    }
    return { ok: false, error: "Could not rename that channel" };
  }

  const channel = toChannel(data as Record<string, unknown>);
  await logAdminAction(admin.email, "rename_share_channel", null, {
    channel_code: channel.code,
    channel_label: trimmed,
  });
  revalidatePath("/admin/drops");
  return { ok: true, channel };
}

/**
 * Retire or restore a channel.
 *
 * Deactivating hides it from new selections. It deletes nothing: the
 * links already in circulation keep resolving, and every order already
 * attributed to it keeps reporting under its code.
 */
export async function setChannelActive(
  channelId: string,
  isActive: boolean,
): Promise<ChannelMutationResult> {
  let admin: { email: string };
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const { data, error } = await adminDb
    .from("share_channels")
    .update({ is_active: isActive })
    .eq("id", channelId)
    .select(CHANNEL_COLS)
    .single();

  if (error || !data) {
    if (error && isMissingEventsTable(error)) {
      return { ok: false, error: CHANNELS_MIGRATION_REQUIRED };
    }
    return { ok: false, error: "Could not update that channel" };
  }

  const channel = toChannel(data as Record<string, unknown>);
  await logAdminAction(admin.email, "toggle_share_channel", null, {
    channel_code: channel.code,
    is_active: isActive,
  });
  revalidatePath("/admin/drops");
  return { ok: true, channel };
}

// ═══════════════════════════════════════════════════════════════════════
// LINKS
// ═══════════════════════════════════════════════════════════════════════

export type ShareLinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * The URL for one drop through one channel.
 *
 * A pure derivation of (origin, drop id, code), so asking twice — after
 * a refresh, tomorrow, from another browser — returns exactly the same
 * string. Nothing is minted and nothing is stored.
 */
export async function shareLinkFor(
  dropId: string,
  code: string | null,
): Promise<ShareLinkResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }

  const origin = appBase();
  if (!origin) {
    return {
      ok: false,
      error: "NEXT_PUBLIC_APP_URL is not configured on this server — cannot build a link.",
    };
  }
  if (!dropId || typeof dropId !== "string") {
    return { ok: false, error: "Unknown drop" };
  }
  if (code !== null && normalizeTag(code) === null) {
    return { ok: false, error: "That channel code is not valid" };
  }

  return { ok: true, url: shareUrl(origin, dropId, code) };
}

export type CopyRecordResult = { ok: boolean };

/**
 * Record that a copy SUCCEEDED in the operator's browser.
 *
 * Called only after `navigator.clipboard.writeText` resolves, so this
 * counts clipboard writes, not button presses. It is still not evidence
 * the link reached anyone.
 *
 * Never throws and never blocks the UI: a failed recording leaves the
 * operator with a copied link and one uncounted event, which is the
 * right trade.
 */
export async function recordChannelCopy(
  dropId: string,
  code: string | null,
  clientEventId: string,
): Promise<CopyRecordResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false };
  }
  const recorded = await recordCopy({
    dropItemId: dropId,
    tag: code,
    clientEventId,
  });
  return { ok: recorded };
}

// ═══════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════

export type ChannelResultsPayload = {
  rows: ChannelResult[];
  totals: AggregateTotals;
  /** Null when copies/visits/sessions are not recorded at all. */
  measuredSince: string | null;
  eventsTracked: boolean;
  migrationMissing: boolean;
  /** True when migration-012 is absent, so orders carry no tag at all. */
  tagColumnMissing: boolean;
};

type AggregateTotals = ReturnType<typeof aggregateChannelResults>["totals"];

export type ChannelResultsResult =
  | { ok: true; results: ChannelResultsPayload }
  | { ok: false; error: string };

/**
 * Per-channel results for ONE drop.
 *
 * Orders and events are read separately and aggregated separately — they
 * are never joined, because joining would multiply each order by its
 * channel's event count. Both reads are paginated past PostgREST's
 * default page so the numbers cover every matching row.
 */
export async function channelResultsForDrop(
  dropId: string,
): Promise<ChannelResultsResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }
  if (!dropId) return { ok: false, error: "Unknown drop" };

  // Orders: all history. `tag` exists from migration-012; if that is not
  // applied, fall back so the panel still reports what it can.
  let ordersRead = await readAll<OrderRow>(
    "orders",
    "tag, quantity, price_paid, status, redemption_status",
    "drop_item_id",
    dropId,
  );
  let tagColumnMissing = false;
  if (ordersRead.error && /tag/i.test(ordersRead.error)) {
    tagColumnMissing = true;
    ordersRead = await readAll<OrderRow>(
      "orders",
      "quantity, price_paid, status, redemption_status",
      "drop_item_id",
      dropId,
    );
  }
  if (ordersRead.error) {
    console.error("[admin/channels] orders read failed:", ordersRead.error);
    return { ok: false, error: "Could not load orders for this drop" };
  }

  // Events: only since instrumentation began, by definition.
  const eventsRead = await readAll<EventRow>(
    "channel_events",
    "tag, event_type",
    "drop_item_id",
    dropId,
  );

  const channelsRead = await adminDb.from("share_channels").select(CHANNEL_COLS);
  const migrationMissing =
    eventsRead.missingTable ||
    (channelsRead.error ? isMissingEventsTable(channelsRead.error) : false);

  const startedAt = migrationMissing ? null : await instrumentationStartedAt();

  const aggregated = aggregateChannelResults({
    orders: ordersRead.rows,
    // null, not [], when the table is absent: that is the difference
    // between "measured and found nothing" and "never measured".
    events: eventsRead.missingTable ? null : eventsRead.rows,
    channels: (channelsRead.data ?? []).map((r) => {
      const row = r as { code: string; label: string; is_active: boolean };
      return { code: row.code, label: row.label, is_active: row.is_active };
    }),
  });

  return {
    ok: true,
    results: {
      rows: aggregated.rows,
      totals: aggregated.totals,
      eventsTracked: aggregated.eventsTracked,
      measuredSince: startedAt ? startedAt.toISOString() : null,
      migrationMissing,
      // migration-012 absent: every order reads as untagged, which is the
      // truth about the data but not about the world. Say so rather than
      // letting the panel imply nobody ever used a channel link.
      tagColumnMissing,
    },
  };
}
