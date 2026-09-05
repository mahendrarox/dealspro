#!/usr/bin/env node
/**
 * Focused unit suite for the launch-hardening PR.
 *
 * Covers, with NO dev server and NO dependency on the real wall clock:
 *   1. Central-time rendering (CST / CDT / DST boundary / midnight-spanning)
 *   2. Studio edit-form round-trip (untouched save must not shift the instant)
 *   3. Pickup-window validation (shared client+server rule)
 *   4. Ticket price/value framing
 *   5. Success-page poll policy (bounded retry)
 *
 * Every assertion is timezone-INDEPENDENT by design: the whole file is
 * run twice by scripts/run-datetime-tests.js, once with TZ=UTC (which
 * reproduces the Vercel runtime, where this class of bug actually
 * appeared) and once with TZ=America/Chicago. Identical expected values
 * must hold under both.
 *
 * Run: node scripts/test-datetime.js        (honors an externally set TZ)
 *      npm run test:datetime                (runs both timezones)
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.local") });

// Register tsx so `require()` of .ts modules works (same trick the main
// regression suite uses for lib/admin/schemas).
try {
  require("tsx/cjs/api").register();
} catch {
  console.error("[datetime] tsx is required to load .ts modules");
  process.exit(1);
}

const {
  centralDateString,
  centralTimeString,
  formatTimeWindow,
  formatDate,
} = require("../lib/drops/helpers");
const { toIso, isoToLocal, addHoursToLocal, emptyDropForm } = require("../app/admin/drops/form-utils");
const {
  validatePickupWindow,
  MAX_PICKUP_WINDOW_HOURS,
} = require("../lib/admin/pickup-window");
const { dropCreateSchema, dropUpdateSchema } = require("../lib/admin/schemas");
const { computeTicketPricing } = require("../lib/tickets/pricing");
const {
  reducePoll,
  initialPollState,
  isTerminal,
  MAX_POLL_ATTEMPTS,
} = require("../lib/tickets/poll-policy");

// ── Harness ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function pass(name) {
  passed++;
  console.log(`  [PASS] ${name}`);
}

function fail(name, reason) {
  failed++;
  failures.push({ name, reason });
  console.log(`  [FAIL] ${name} — ${reason}`);
}

function eq(name, actual, expected) {
  if (actual === expected) pass(name);
  else fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function ok(name, cond, reason) {
  if (cond) pass(name);
  else fail(name, reason || "expected truthy");
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

/** Build a minimal DropItem for the display helpers. */
function item(startIso, endIso) {
  return {
    start_time_iso: startIso,
    end_time_iso: endIso,
    date: centralDateString(startIso),
    start_time: centralTimeString(startIso),
    end_time: centralTimeString(endIso),
  };
}

/**
 * Freeze Date.now() for the duration of `fn`. The create schema refines
 * on "end_time must be in the future", so validation tests must not read
 * the real clock.
 */
function withFrozenNow(isoNow, fn) {
  const realNow = Date.now;
  Date.now = () => new Date(isoNow).getTime();
  try {
    return fn();
  } finally {
    Date.now = realNow;
  }
}

console.log("═".repeat(54));
console.log(`  DealsPro focused suite — process TZ = ${process.env.TZ || "(host default)"}`);
console.log(`  Intl resolved TZ = ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
console.log("═".repeat(54));

// ══════════════════════════════════════════════════════════════════════
section("1. Central-time rendering");

// Winter — CST (UTC−6). 11:00 AM Central on Jan 15 2026 == 17:00Z.
eq("CST: 11:00 Central → 17:00Z", toIso("2026-01-15T11:00"), "2026-01-15T17:00:00.000Z");
eq("CST: 17:00Z → 11:00 Central", centralTimeString("2026-01-15T17:00:00.000Z"), "11:00");
eq("CST: 17:00Z → date 2026-01-15", centralDateString("2026-01-15T17:00:00.000Z"), "2026-01-15");

// Summer — CDT (UTC−5). This is the exact reported bug: a stored 16:00Z
// rendered as "16:00" → "4 PM" instead of 11:00 AM Central.
eq("CDT: 11:00 Central → 16:00Z", toIso("2026-07-23T11:00"), "2026-07-23T16:00:00.000Z");
eq("CDT: 16:00Z → 11:00 Central", centralTimeString("2026-07-23T16:00:00.000Z"), "11:00");
eq("CDT: 16:00Z → date 2026-07-23", centralDateString("2026-07-23T16:00:00.000Z"), "2026-07-23");

// The reported symptom, end to end: 11 AM–1 PM Central must never print 4–6 PM.
eq(
  "Reported bug: 16:00Z–18:00Z renders '11 AM–1 PM'",
  formatTimeWindow(item("2026-07-23T16:00:00.000Z", "2026-07-23T18:00:00.000Z")),
  "11 AM–1 PM",
);

// DST boundaries (2026: spring forward Mar 8, fall back Nov 1).
eq("DST: Mar 8 01:00 CST → 07:00Z", toIso("2026-03-08T01:00"), "2026-03-08T07:00:00.000Z");
eq("DST: Mar 8 03:00 CDT → 08:00Z", toIso("2026-03-08T03:00"), "2026-03-08T08:00:00.000Z");
eq("DST: 07:00Z → 01:00 Central (pre-jump)", centralTimeString("2026-03-08T07:00:00.000Z"), "01:00");
eq("DST: 08:00Z → 03:00 Central (post-jump)", centralTimeString("2026-03-08T08:00:00.000Z"), "03:00");
eq("DST: Nov 1 03:00 CST → 09:00Z", toIso("2026-11-01T03:00"), "2026-11-01T09:00:00.000Z");
eq("DST: 09:00Z → 03:00 Central (post-fallback)", centralTimeString("2026-11-01T09:00:00.000Z"), "03:00");

// Midnight-spanning window: stored instants land on two different UTC
// dates AND two different Central dates.
{
  const start = "2026-07-26T03:00:00.000Z"; // Jul 25, 10:00 PM CDT
  const end = "2026-07-26T06:00:00.000Z"; // Jul 26, 01:00 AM CDT
  eq("Midnight-span: start date is Central Jul 25", centralDateString(start), "2026-07-25");
  eq("Midnight-span: start time 22:00", centralTimeString(start), "22:00");
  eq("Midnight-span: end time 01:00", centralTimeString(end), "01:00");
  eq("Midnight-span: window '10 PM–1 AM'", formatTimeWindow(item(start, end)), "10 PM–1 AM");
  eq(
    "Midnight-span: date label is the START day",
    formatDate(item(start, end)),
    "Saturday, Jul 25",
  );
}

// Exact Central midnight must be 00:00, never "24:00".
eq("Midnight normalizes to 00:00", centralTimeString("2026-05-20T05:00:00.000Z"), "00:00");
eq("Midnight date is the Central day", centralDateString("2026-05-20T05:00:00.000Z"), "2026-05-20");

// Consistency: the derived display strings and the shared window
// formatter must describe the same clock. Stripe's line-item description
// and the SMS body are built from `item.date` + formatTimeWindow(item),
// so these two must agree or those messages contradict the ticket.
{
  const start = "2026-07-23T16:00:00.000Z";
  const end = "2026-07-23T18:00:00.000Z";
  const it = item(start, end);
  eq("Surface consistency: derived date", it.date, "2026-07-23");
  eq("Surface consistency: derived start", it.start_time, "11:00");
  eq("Surface consistency: derived end", it.end_time, "13:00");
  const hour = Number(it.start_time.split(":")[0]);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  ok(
    "Surface consistency: derived strings agree with formatTimeWindow",
    formatTimeWindow(it).startsWith(`${h12} ${ampm}`),
    `window "${formatTimeWindow(it)}" disagrees with derived "${it.start_time}"`,
  );
}

// ── The mapper itself ─────────────────────────────────────────────────
//
// The tests above prove the helper is correct; these prove dbRowToDropItem
// actually USES it. This is the guard that would have caught the original
// defect, where the mapper derived its display strings with host-local
// getters (getHours/getDate) and silently rendered UTC on Vercel.
{
  let dbRowToDropItem = null;
  try {
    ({ dbRowToDropItem } = require("../lib/drops/db"));
  } catch (err) {
    fail("Mapper: load lib/drops/db", err.message);
  }

  if (dbRowToDropItem) {
    const row = (start, end) => ({
      id: "test-row",
      title: "Test",
      restaurant_name: "Test Kitchen",
      image_url: null,
      price: 10,
      original_price: 20,
      total_spots: 7,
      start_time: start,
      end_time: end,
      is_active: true,
      is_hero: false,
      priority: 0,
      created_at: "",
      updated_at: "",
      address: null,
      latitude: null,
      longitude: null,
      restaurant_id: null,
    });

    // The exact reported row shape: stored 16:00Z must map to 11:00.
    const mapped = dbRowToDropItem(row("2026-07-23T16:00:00+00:00", "2026-07-23T18:00:00+00:00"));
    eq("Mapper: date is Central", mapped.date, "2026-07-23");
    eq("Mapper: start_time is Central 11:00 (not UTC 16:00)", mapped.start_time, "11:00");
    eq("Mapper: end_time is Central 13:00 (not UTC 18:00)", mapped.end_time, "13:00");
    eq("Mapper: preserves the UTC instant", mapped.start_time_iso, "2026-07-23T16:00:00.000Z");
    eq("Mapper: window renders 11 AM–1 PM", formatTimeWindow(mapped), "11 AM–1 PM");

    // Winter row — proves the offset is derived, not a hardcoded −5.
    const winter = dbRowToDropItem(row("2026-01-15T17:00:00+00:00", "2026-01-15T19:00:00+00:00"));
    eq("Mapper: CST start_time", winter.start_time, "11:00");
    eq("Mapper: CST date", winter.date, "2026-01-15");

    // Midnight-spanning row — the Central date must follow the START.
    const span = dbRowToDropItem(row("2026-07-26T03:00:00+00:00", "2026-07-26T06:00:00+00:00"));
    eq("Mapper: midnight-span date follows start", span.date, "2026-07-25");
    eq("Mapper: midnight-span start_time", span.start_time, "22:00");
    eq("Mapper: midnight-span end_time", span.end_time, "01:00");
    eq("Mapper: midnight-span window", formatTimeWindow(span), "10 PM–1 AM");
  }
}

// ══════════════════════════════════════════════════════════════════════
section("2. Studio edit-form round-trip");

// The edit page hydrates datetime inputs from the RAW stored ISO via
// isoToLocal, then saves via toIso. Loading a drop and saving it without
// touching either field must not move the stored instant by even a
// millisecond. Compare instants, not text — the driver may reformat.
{
  const stored = [
    "2026-01-15T17:00:00.000Z", // CST
    "2026-07-23T16:00:00.000Z", // CDT
    "2026-03-08T07:00:00.000Z", // just before spring forward
    "2026-03-08T08:00:00.000Z", // just after spring forward
    "2026-11-01T09:00:00.000Z", // after fall back
    "2026-07-26T03:00:00.000Z", // late evening, spans midnight
    "2026-05-20T05:00:00.000Z", // exact Central midnight
  ];
  for (const iso of stored) {
    const hydrated = isoToLocal(iso); // what the form input shows
    const saved = toIso(hydrated); // what an untouched save writes back
    const same = new Date(saved).getTime() === new Date(iso).getTime();
    ok(
      `Round-trip preserves instant: ${iso}`,
      same,
      `hydrated "${hydrated}" saved back as ${saved}`,
    );
  }
}

// A display-formatted Central string must never be mistaken for storage.
{
  const iso = "2026-07-23T16:00:00.000Z";
  ok(
    "Display string is NOT a storage value",
    centralTimeString(iso) === "11:00" && iso.includes("16:00"),
    "display projection collided with the stored instant",
  );
}

// ══════════════════════════════════════════════════════════════════════
section("3. Pickup-window validation");

const S = "2026-07-23T16:00:00.000Z";
const plus = (h) => new Date(new Date(S).getTime() + h * 3600_000).toISOString();

ok("Rejects end == start", !validatePickupWindow(S, S).ok);
ok("Rejects end before start", !validatePickupWindow(S, plus(-2)).ok);
ok("Accepts 2h (existing default)", validatePickupWindow(S, plus(2)).ok);
ok(`Accepts exactly ${MAX_PICKUP_WINDOW_HOURS}h`, validatePickupWindow(S, plus(12)).ok);
ok("Rejects 12h + 1ms", !validatePickupWindow(S, new Date(new Date(S).getTime() + 12 * 3600_000 + 1).toISOString()).ok);
ok("Rejects 13h", !validatePickupWindow(S, plus(13)).ok);
ok("Rejects the real 50h Sai Gayatri window", !validatePickupWindow(S, plus(50)).ok);
ok("Rejects the real 146h Hyderabad House window", !validatePickupWindow(S, plus(146)).ok);
ok("Rejects unparseable input", !validatePickupWindow("nonsense", plus(2)).ok);
ok(
  "Error message points at the END DATE",
  /end date/i.test(validatePickupWindow(S, plus(50)).message || ""),
  "message should steer the admin to the end date",
);

// The 2-hour smart default must still be what the create form produces.
{
  const form = emptyDropForm(new Date("2026-07-23T10:00:00.000Z"));
  const startIso = toIso(form.start_time);
  const endIso = toIso(form.end_time);
  const hours = (new Date(endIso) - new Date(startIso)) / 3600_000;
  eq("Create form still defaults to a 2h window", hours, 2);
  ok("Default window passes validation", validatePickupWindow(startIso, endIso).ok);
  eq("addHoursToLocal(+2) matches the default", addHoursToLocal(form.start_time, 2), form.end_time);
}

// Server must reject independently of the client — this is the check
// that a crafted request bypassing the form still hits.
withFrozenNow("2026-07-01T00:00:00.000Z", () => {
  const base = {
    id: "test-drop-window",
    title: "Test",
    restaurant_id: "11111111-1111-4111-8111-111111111111",
    image_url: "",
    price: 10,
    original_price: 20,
    total_spots: 7,
    is_active: true,
    is_hero: false,
    priority: 0,
  };

  ok(
    "Server CREATE accepts a 2h window",
    dropCreateSchema.safeParse({ ...base, start_time: S, end_time: plus(2) }).success,
  );
  ok(
    `Server CREATE accepts exactly ${MAX_PICKUP_WINDOW_HOURS}h`,
    dropCreateSchema.safeParse({ ...base, start_time: S, end_time: plus(12) }).success,
  );
  ok(
    "Server CREATE rejects 13h (bypassed client)",
    !dropCreateSchema.safeParse({ ...base, start_time: S, end_time: plus(13) }).success,
  );
  ok(
    "Server CREATE rejects end == start",
    !dropCreateSchema.safeParse({ ...base, start_time: S, end_time: S }).success,
  );
  ok(
    "Server CREATE rejects end before start",
    !dropCreateSchema.safeParse({ ...base, start_time: S, end_time: plus(-1) }).success,
  );

  const upd = {
    title: "Test",
    restaurant_name: "Test Kitchen",
    image_url: "",
    price: 10,
    original_price: 20,
    total_spots: 7,
    is_active: true,
    is_hero: false,
    priority: 0,
  };
  ok(
    "Server UPDATE accepts a 2h window",
    dropUpdateSchema.safeParse({ ...upd, start_time: S, end_time: plus(2) }).success,
  );
  ok(
    "Server UPDATE rejects 50h — historical row must be corrected before saving",
    !dropUpdateSchema.safeParse({ ...upd, start_time: S, end_time: plus(50) }).success,
  );
  ok(
    "Server UPDATE surfaces the error on end_time",
    (dropUpdateSchema.safeParse({ ...upd, start_time: S, end_time: plus(50) }).error?.issues || [])
      .some((i) => i.path.includes("end_time")),
    "expected an issue pathed to end_time",
  );
});

// ══════════════════════════════════════════════════════════════════════
section("4. Ticket price/value framing");

{
  // Quantity 1, real saving.
  const p1 = computeTicketPricing({ pricePaid: 39, originalPrice: 55, quantity: 1 });
  eq("qty1: paid", p1.paid, 39);
  eq("qty1: regular value", p1.originalTotal, 55);
  eq("qty1: savings", p1.savings, 16);
  ok("qty1: shows savings", p1.showSavings);
  eq("qty1: quantity", p1.quantity, 1);

  // Quantity > 1 — price_paid is the ORDER TOTAL, originalPrice is PER UNIT.
  const p3 = computeTicketPricing({ pricePaid: 117, originalPrice: 55, quantity: 3 });
  eq("qty3: paid is the order total", p3.paid, 117);
  eq("qty3: regular value scales with quantity", p3.originalTotal, 165);
  eq("qty3: savings across the order", p3.savings, 48);
  ok("qty3: shows savings", p3.showSavings);
  eq("qty3: quantity", p3.quantity, 3);

  // Missing regular value.
  const pNull = computeTicketPricing({ pricePaid: 39, originalPrice: null, quantity: 1 });
  eq("no regular value: originalTotal null", pNull.originalTotal, null);
  eq("no regular value: savings 0", pNull.savings, 0);
  ok("no regular value: hides savings", !pNull.showSavings);

  // Regular value == paid.
  const pEq = computeTicketPricing({ pricePaid: 55, originalPrice: 55, quantity: 1 });
  eq("equal value: savings 0", pEq.savings, 0);
  ok("equal value: hides savings (no $0.00 line)", !pEq.showSavings);

  // Invalid: regular value BELOW paid — must never invert into a negative.
  const pLow = computeTicketPricing({ pricePaid: 60, originalPrice: 55, quantity: 1 });
  eq("regular < paid: savings clamped to 0", pLow.savings, 0);
  ok("regular < paid: hides savings", !pLow.showSavings);
  ok("regular < paid: never negative", pLow.savings >= 0);

  // Zero / nonsense regular price is treated as absent, not as a saving.
  const pZero = computeTicketPricing({ pricePaid: 39, originalPrice: 0, quantity: 1 });
  eq("zero regular price: originalTotal null", pZero.originalTotal, null);
  ok("zero regular price: hides savings", !pZero.showSavings);

  // Defensive quantity normalization.
  eq("quantity 0 normalizes to 1", computeTicketPricing({ pricePaid: 10, originalPrice: null, quantity: 0 }).quantity, 1);
}

// ══════════════════════════════════════════════════════════════════════
section("5. Success-page poll policy");

{
  // Immediate success — the server already had the order at render time.
  eq("immediate: starts resolved", initialPollState(true).phase, "resolved");
  ok("immediate: terminal", isTerminal(initialPollState(true)));

  eq("no initial data: starts polling", initialPollState(false).phase, "polling");

  // Delayed webhook, then success.
  {
    let s = initialPollState(false);
    for (let i = 0; i < 5; i++) s = reducePoll(s, { type: "empty" });
    eq("delayed: still polling after 5 empties", s.phase, "polling");
    s = reducePoll(s, { type: "card" });
    eq("delayed: resolves on card", s.phase, "resolved");
    eq("delayed: consumed 6 attempts", s.attempts, 6);
  }

  // Transient HTTP/network failure, then success.
  {
    let s = initialPollState(false);
    s = reducePoll(s, { type: "transient" });
    s = reducePoll(s, { type: "transient" });
    eq("transient: not terminal while attempts remain", s.phase, "polling");
    s = reducePoll(s, { type: "card" });
    eq("transient: recovers and resolves", s.phase, "resolved");
  }

  // Maximum attempts reached.
  {
    let s = initialPollState(false);
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) s = reducePoll(s, { type: "empty" });
    eq(`max: times out after ${MAX_POLL_ATTEMPTS} attempts`, s.phase, "timed_out");
    eq("max: attempts recorded", s.attempts, MAX_POLL_ATTEMPTS);
    ok("max: terminal", isTerminal(s));

    // One attempt earlier it must still be polling — proves the bound is
    // exact and not off by one.
    let s2 = initialPollState(false);
    for (let i = 0; i < MAX_POLL_ATTEMPTS - 1; i++) s2 = reducePoll(s2, { type: "empty" });
    eq("max: still polling one attempt before the bound", s2.phase, "polling");

    // A terminal machine ignores further poll results.
    const after = reducePoll(s, { type: "card" });
    eq("max: terminal state ignores late results", after.phase, "timed_out");
  }

  // Retry resets the counter and restarts polling.
  {
    let s = initialPollState(false);
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) s = reducePoll(s, { type: "empty" });
    eq("retry: timed out first", s.phase, "timed_out");
    s = reducePoll(s, { type: "retry" });
    eq("retry: back to polling", s.phase, "polling");
    eq("retry: attempts reset to 0", s.attempts, 0);
    ok("retry: not terminal", !isTerminal(s));

    // And a full fresh budget is available after the reset.
    for (let i = 0; i < MAX_POLL_ATTEMPTS - 1; i++) s = reducePoll(s, { type: "empty" });
    eq("retry: full budget restored", s.phase, "polling");
  }

  // A bounded run can never poll forever — the original defect.
  {
    let s = initialPollState(false);
    let guard = 0;
    while (!isTerminal(s) && guard < 10_000) {
      s = reducePoll(s, { type: "empty" });
      guard++;
    }
    ok("bounded: polling always terminates", isTerminal(s), "loop never reached a terminal phase");
    eq("bounded: terminated at the budget", guard, MAX_POLL_ATTEMPTS);
  }
}

// ══════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(54));
console.log(`  TZ=${process.env.TZ || "(host)"} → ${passed} PASS / ${failed} FAIL`);
console.log("═".repeat(54));

if (failed > 0) {
  console.log("\nFAILED:");
  for (const f of failures) console.log(`  ✗ ${f.name} — ${f.reason}`);
  process.exit(1);
}
console.log("\nAll focused tests passed ✓");
process.exit(0);
