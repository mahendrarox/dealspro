import { normalizeTag } from "@/lib/attribution/tag";

/**
 * Turning rows into per-channel results.
 *
 * Pure on purpose. Every counting rule that could be got quietly wrong —
 * quantity vs orders, price_paid already including quantity, untagged
 * rows, tags with no registry entry, inactive channels that still have
 * history — is decided here, where a test can pin it without a database.
 *
 * WHAT THESE NUMBERS ARE NOT:
 *   * A copy is not evidence the link was shared with anyone.
 *   * A visit is a page that rendered, not a unique person and not reach.
 *   * A checkout session is not a payment.
 *   * None of it is proof of incremental sales. It is attribution: which
 *     link a buyer arrived through, nothing more.
 */

/** The bucket label for orders and events carrying no tag. */
export const UNTAGGED_KEY = "__untagged__";

/** Only this order status counts as a sale. Mirrors lib/spots.ts. */
export const PAID_STATUS = "paid";

/** Only this redemption status counts as picked up. */
export const REDEEMED_STATUS = "redeemed";

export type OrderRow = {
  tag?: string | null;
  quantity?: number | null;
  price_paid?: number | string | null;
  status?: string | null;
  redemption_status?: string | null;
};

export type EventRow = {
  tag?: string | null;
  event_type?: string | null;
};

export type ChannelRow = {
  code: string;
  label: string;
  is_active?: boolean | null;
};

export type ChannelResult = {
  /** The recorded code. For the untagged bucket, UNTAGGED_KEY. */
  key: string;
  /** What to display. An unregistered tag shows its own code. */
  label: string;
  /** False for a tag seen in data with no registry row. */
  isRegistered: boolean;
  isActive: boolean;
  isUntagged: boolean;

  // ── Measured only since instrumentation began ────────────────────
  copies: number;
  visits: number;
  checkoutSessions: number;

  // ── Derived from orders, available for all history ───────────────
  paidOrders: number;
  packsOrdered: number;
  pickedUpOrders: number;
  /**
   * SUM(price_paid) over paid orders. price_paid is ALREADY
   * quantity-inclusive (the webhook computes item.price * quantity), so
   * it is never multiplied by quantity again.
   *
   * This is recorded order value BEFORE refunds. It is not net revenue
   * and not verified Stripe collections.
   */
  recordedValueBeforeRefunds: number;
};

export type AggregateInput = {
  orders: OrderRow[];
  /** Null when the events table is absent — "not tracked", not zero. */
  events: EventRow[] | null;
  channels: ChannelRow[];
};

export type AggregateOutput = {
  rows: ChannelResult[];
  totals: Omit<ChannelResult, "key" | "label" | "isRegistered" | "isActive" | "isUntagged">;
  /** False when copies/visits/checkout sessions are not being recorded. */
  eventsTracked: boolean;
};

/** Normalize a stored tag to its bucket key. Unparseable → untagged. */
function bucketKey(tag: string | null | undefined): string {
  const normalized = normalizeTag(tag);
  return normalized ?? UNTAGGED_KEY;
}

/** Money arrives from PostgREST as a string for `numeric` columns. */
function toAmount(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Quantity defaults to 1: the column is NOT NULL DEFAULT 1 in practice. */
function toQuantity(value: number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? 1), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function emptyResult(key: string, label: string): ChannelResult {
  return {
    key,
    label,
    isRegistered: false,
    isActive: false,
    isUntagged: key === UNTAGGED_KEY,
    copies: 0,
    visits: 0,
    checkoutSessions: 0,
    paidOrders: 0,
    packsOrdered: 0,
    pickedUpOrders: 0,
    recordedValueBeforeRefunds: 0,
  };
}

/**
 * Aggregate orders and events into one row per channel.
 *
 * Orders and events are counted in SEPARATE passes and never joined. A
 * join would multiply a single order by however many visits its channel
 * had, which is the classic way these dashboards come to overstate
 * sales.
 *
 * Every registered channel appears even with no activity, so an operator
 * who just created one sees it. Every tag present in the data appears
 * even with no registry row, so totals reconcile — an unknown tag is
 * shown under its recorded code and is NOT silently folded into
 * untagged, and is never auto-assigned to a newly created channel.
 */
export function aggregateChannelResults(input: AggregateInput): AggregateOutput {
  const { orders, events, channels } = input;
  const byKey = new Map<string, ChannelResult>();

  // 1. Seed from the registry, so a channel with no activity is visible.
  for (const channel of channels) {
    const code = normalizeTag(channel.code);
    if (!code) continue;
    const row = emptyResult(code, channel.label?.trim() || code);
    row.isRegistered = true;
    row.isActive = channel.is_active !== false;
    byKey.set(code, row);
  }

  const ensure = (key: string): ChannelResult => {
    let row = byKey.get(key);
    if (!row) {
      // A tag with no registry entry. It keeps its own code as its
      // label — never relabelled, never reassigned to a partner who
      // happens to have been created later.
      row = emptyResult(key, key === UNTAGGED_KEY ? "Untagged" : key);
      byKey.set(key, row);
    }
    return row;
  };

  // 2. Orders. One pass, one row counted once.
  for (const order of orders) {
    if (order?.status !== PAID_STATUS) continue;
    const row = ensure(bucketKey(order.tag));
    row.paidOrders += 1;
    row.packsOrdered += toQuantity(order.quantity);
    row.recordedValueBeforeRefunds += toAmount(order.price_paid);
    if (order.redemption_status === REDEEMED_STATUS) row.pickedUpOrders += 1;
  }

  // 3. Events. Separate pass. Deduplication already happened at write
  //    time via the unique index on dedupe_key; here each row is one.
  const eventsTracked = Array.isArray(events);
  for (const event of events ?? []) {
    const row = ensure(bucketKey(event.tag));
    if (event.event_type === "copy") row.copies += 1;
    else if (event.event_type === "visit") row.visits += 1;
    else if (event.event_type === "checkout_session") row.checkoutSessions += 1;
  }

  // Rounding only at the end: summing cents as floats drifts, and a
  // money column that reads 41.989999999 undermines the whole panel.
  for (const row of byKey.values()) {
    row.recordedValueBeforeRefunds = Math.round(row.recordedValueBeforeRefunds * 100) / 100;
  }

  // 4. Order: active registered channels first (alphabetical), then
  //    retired ones, then unknown tags, then untagged last.
  const rank = (r: ChannelResult) =>
    r.isUntagged ? 3 : !r.isRegistered ? 2 : r.isActive ? 0 : 1;
  const rows = Array.from(byKey.values()).sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label),
  );

  const totals = rows.reduce(
    (acc, r) => ({
      copies: acc.copies + r.copies,
      visits: acc.visits + r.visits,
      checkoutSessions: acc.checkoutSessions + r.checkoutSessions,
      paidOrders: acc.paidOrders + r.paidOrders,
      packsOrdered: acc.packsOrdered + r.packsOrdered,
      pickedUpOrders: acc.pickedUpOrders + r.pickedUpOrders,
      recordedValueBeforeRefunds:
        acc.recordedValueBeforeRefunds + r.recordedValueBeforeRefunds,
    }),
    {
      copies: 0,
      visits: 0,
      checkoutSessions: 0,
      paidOrders: 0,
      packsOrdered: 0,
      pickedUpOrders: 0,
      recordedValueBeforeRefunds: 0,
    },
  );
  totals.recordedValueBeforeRefunds =
    Math.round(totals.recordedValueBeforeRefunds * 100) / 100;

  return { rows, totals, eventsTracked };
}
