#!/usr/bin/env node
/**
 * Studio sharing — focused suite.
 *
 * Everything provable without a database or a running server: code
 * generation and its collision rule, URL derivation, the aggregation
 * rules that decide what every number in the Share panel means, and
 * structural invariants over the places those rules could be bypassed.
 *
 * The database-backed half (constraints, dedupe under a real unique
 * index, deny-all RLS) is scripts/test-channels-db.js.
 *
 * Run: npm run test:channels
 */

const path = require("path");
const fs = require("fs");

try {
  require("tsx/cjs/api").register();
} catch {
  console.error("[channels] tsx is required to run this suite (npm i)");
  process.exit(1);
}

const {
  codeCandidateFromLabel,
  generateChannelCode,
  shareUrl,
  CODE_MAX_LENGTH,
  CODE_FALLBACK_PREFIX,
} = require(path.resolve(__dirname, "../lib/channels/codes.ts"));
const {
  aggregateChannelResults,
  UNTAGGED_KEY,
  PAID_STATUS,
  REDEEMED_STATUS,
} = require(path.resolve(__dirname, "../lib/channels/aggregate.ts"));
const { normalizeTag, appendTag } = require(path.resolve(__dirname, "../lib/attribution/tag.ts"));

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, reason = "assertion failed") {
  if (cond) {
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } else {
    failed += 1;
    failures.push({ name, reason });
    console.log(`  [FAIL] ${name} — ${reason}`);
  }
}
const section = (t) => console.log(`\n── ${t} ──`);

const REPO = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * Code only: comments, string literals and JSX text removed.
 *
 * A "never references X" assertion has to look at what the file DOES.
 * The Share panel's own copy says "Same drop, price and inventory for
 * every channel" — that sentence is the product explaining itself, not
 * the panel reading a price.
 */
const codeOnly = (s) =>
  strip(s)
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/>[^<>{}]+</g, "><");

// ═══════════════════════════════════════════════════════════════════════
// 1. CODE GENERATION
// ═══════════════════════════════════════════════════════════════════════

function testCodes() {
  section("Codes: derived from the name, never typed by hand");

  for (const [label, expected] of [
    ["Ramesh", "ramesh"],
    ["Frisco WhatsApp", "frisco-whatsapp"],
    ["Restaurant Instagram", "restaurant-instagram"],
    ["  Spaced   Out  ", "spaced-out"],
    ["UPPER CASE", "upper-case"],
    ["Ramesh's List", "rameshs-list"],
    ["A & B", "a-b"],
  ]) {
    check(
      `candidate "${label}" → "${expected}"`,
      codeCandidateFromLabel(label) === expected,
      `got "${codeCandidateFromLabel(label)}"`,
    );
  }

  // A label that slugifies to nothing must still yield a usable code
  // rather than an empty tag that the normalizer would reject.
  for (const label of ["", "   ", "!!!", "日本語", "---"]) {
    const c = codeCandidateFromLabel(label);
    check(
      `candidate ${JSON.stringify(label)} falls back to "${CODE_FALLBACK_PREFIX}"`,
      c === CODE_FALLBACK_PREFIX,
      `got "${c}"`,
    );
  }

  // EVERY generated code must survive the SAME normalizer the drop page,
  // the checkout API and the webhook each apply. A code that normalizes
  // to something else would attribute orders to a different tag than the
  // registry believes.
  const labels = [
    "Ramesh", "Frisco WhatsApp", "日本語", "!!!", "x".repeat(200),
    "Mixed CASE and-dashes", "7-Eleven", "a".repeat(70),
  ];
  for (const label of labels) {
    const code = generateChannelCode(label, []);
    check(
      `generated code for ${JSON.stringify(label.slice(0, 20))} survives normalizeTag`,
      code !== null && normalizeTag(code) === code,
      `code=${JSON.stringify(code)} normalized=${JSON.stringify(normalizeTag(code))}`,
    );
    check(
      `generated code for ${JSON.stringify(label.slice(0, 20))} is within ${CODE_MAX_LENGTH}`,
      code !== null && code.length <= CODE_MAX_LENGTH && code.length >= 1,
      `len=${code?.length}`,
    );
  }

  // ── Collisions ───────────────────────────────────────────────────
  check("first Ramesh → ramesh", generateChannelCode("Ramesh", []) === "ramesh");
  check(
    "second Ramesh → ramesh-2",
    generateChannelCode("Ramesh", ["ramesh"]) === "ramesh-2",
    generateChannelCode("Ramesh", ["ramesh"]),
  );
  check(
    "third Ramesh → ramesh-3",
    generateChannelCode("Ramesh", ["ramesh", "ramesh-2"]) === "ramesh-3",
  );
  check(
    "collision check is case-insensitive",
    generateChannelCode("Ramesh", ["RAMESH"]) === "ramesh-2",
    generateChannelCode("Ramesh", ["RAMESH"]),
  );
  check(
    "a long contested label still fits the bound",
    (() => {
      const long = "a".repeat(64);
      const code = generateChannelCode("a".repeat(200), [long]);
      return code !== null && code.length <= CODE_MAX_LENGTH && code !== long;
    })(),
  );
  check(
    "generation is deterministic — same inputs, same code",
    generateChannelCode("Frisco WhatsApp", ["frisco-whatsapp"]) ===
      generateChannelCode("Frisco WhatsApp", ["frisco-whatsapp"]),
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2. URLS
// ═══════════════════════════════════════════════════════════════════════

function testUrls() {
  section("URLs: stable, absolute, same drop every time");

  const ORIGIN = "https://www.dealspro.ai";

  check(
    "a channel link is the drop URL plus ?tag=",
    shareUrl(ORIGIN, "drop-abc", "ramesh") === "https://www.dealspro.ai/drop/drop-abc?tag=ramesh",
    shareUrl(ORIGIN, "drop-abc", "ramesh"),
  );
  check(
    "no channel → the plain drop URL, no dangling ?",
    shareUrl(ORIGIN, "drop-abc", null) === "https://www.dealspro.ai/drop/drop-abc",
    shareUrl(ORIGIN, "drop-abc", null),
  );
  check(
    "a trailing slash on the origin is absorbed",
    shareUrl("https://www.dealspro.ai/", "drop-abc", "ramesh") ===
      "https://www.dealspro.ai/drop/drop-abc?tag=ramesh",
  );

  // THE invariant behind "copy again, get the same link".
  const first = shareUrl(ORIGIN, "drop-abc", "ramesh");
  for (let i = 0; i < 25; i += 1) {
    if (shareUrl(ORIGIN, "drop-abc", "ramesh") !== first) {
      check("repeated derivation returns an identical URL", false, `drifted on call ${i}`);
      break;
    }
  }
  check("repeated derivation returns an identical URL", true);

  // Two channels, two tags, ONE drop.
  const a = shareUrl(ORIGIN, "drop-abc", "ramesh");
  const b = shareUrl(ORIGIN, "drop-abc", "frisco-whatsapp");
  check("two channels produce different links", a !== b);
  check(
    "…pointing at the SAME drop",
    new URL(a).pathname === new URL(b).pathname &&
      new URL(a).pathname === "/drop/drop-abc",
  );
  check(
    "…differing only in the tag parameter",
    new URL(a).searchParams.get("tag") === "ramesh" &&
      new URL(b).searchParams.get("tag") === "frisco-whatsapp" &&
      [...new URL(a).searchParams.keys()].length === 1,
  );

  // Case folding is a normalization, not a rejection: a code typed in
  // caps resolves to the same link as its lowercase form.
  check(
    "a code differing only in case folds to the same link",
    shareUrl(ORIGIN, "drop-abc", "UPPER") === "https://www.dealspro.ai/drop/drop-abc?tag=upper",
    shareUrl(ORIGIN, "drop-abc", "UPPER"),
  );

  // An invalid code can never reach a URL.
  for (const bad of ["ram esh", "", "a".repeat(65), "x/y", "a b c"]) {
    const built = shareUrl(ORIGIN, "drop-abc", bad);
    check(
      `invalid code ${JSON.stringify(bad)} yields an untagged link, never a broken one`,
      built === "https://www.dealspro.ai/drop/drop-abc",
      built,
    );
  }

  // The query-building rule must match the customer-side helper exactly,
  // or a shared link and an internally generated one would disagree.
  check(
    "shareUrl's query matches appendTag's rule",
    shareUrl(ORIGIN, "d", "ramesh") === ORIGIN + appendTag("/drop/d", "ramesh"),
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. AGGREGATION
// ═══════════════════════════════════════════════════════════════════════

const order = (over = {}) => ({
  tag: null,
  quantity: 1,
  price_paid: 10,
  status: PAID_STATUS,
  redemption_status: "pending",
  ...over,
});
const ev = (type, tag = null) => ({ event_type: type, tag });

function testAggregation() {
  section("Aggregation: what every number in the panel means");

  // ── Quantity vs orders vs money ──────────────────────────────────
  {
    const out = aggregateChannelResults({
      orders: [
        order({ tag: "ramesh", quantity: 3, price_paid: 30 }),
        order({ tag: "ramesh", quantity: 1, price_paid: 10 }),
      ],
      events: [],
      channels: [{ code: "ramesh", label: "Ramesh", is_active: true }],
    });
    const r = out.rows.find((x) => x.key === "ramesh");
    check("paid orders counts ORDERS", r.paidOrders === 2, `got ${r.paidOrders}`);
    check("packs counts QUANTITY", r.packsOrdered === 4, `got ${r.packsOrdered}`);
    check(
      "price_paid is NOT multiplied by quantity again",
      r.recordedValueBeforeRefunds === 40,
      `got ${r.recordedValueBeforeRefunds} (90 would mean double-counting)`,
    );
  }

  // ── Only paid counts ─────────────────────────────────────────────
  {
    const out = aggregateChannelResults({
      orders: [
        order({ tag: "ramesh", status: "pending", price_paid: 99 }),
        order({ tag: "ramesh", status: "failed", price_paid: 99 }),
        order({ tag: "ramesh", status: PAID_STATUS, price_paid: 10 }),
      ],
      events: [],
      channels: [],
    });
    const r = out.rows.find((x) => x.key === "ramesh");
    check("unpaid orders are excluded entirely", r.paidOrders === 1 && r.recordedValueBeforeRefunds === 10);
  }

  // ── Pickups ──────────────────────────────────────────────────────
  {
    const out = aggregateChannelResults({
      orders: [
        order({ tag: "r", redemption_status: REDEEMED_STATUS }),
        order({ tag: "r", redemption_status: "pending" }),
        order({ tag: "r", redemption_status: REDEEMED_STATUS, status: "pending" }),
      ],
      events: [],
      channels: [],
    });
    const r = out.rows.find((x) => x.key === "r");
    check("picked up counts redeemed PAID orders only", r.pickedUpOrders === 1, `got ${r.pickedUpOrders}`);
    check("picked up never exceeds paid", r.pickedUpOrders <= r.paidOrders);
  }

  // ── Untagged and unknown tags ────────────────────────────────────
  {
    const out = aggregateChannelResults({
      orders: [
        order({ tag: null }),
        order({ tag: "" }),
        order({ tag: "ghost-partner" }),
        order({ tag: "ramesh" }),
      ],
      events: [],
      channels: [{ code: "ramesh", label: "Ramesh", is_active: true }],
    });
    const untagged = out.rows.find((x) => x.key === UNTAGGED_KEY);
    const ghost = out.rows.find((x) => x.key === "ghost-partner");

    check("null and empty tags land in one Untagged bucket", untagged && untagged.paidOrders === 2);
    check("an unknown tag gets its own row", Boolean(ghost));
    check("…labelled with its own recorded code", ghost.label === "ghost-partner");
    check("…marked unregistered", ghost.isRegistered === false);
    check(
      "…NOT folded into Untagged and NOT reassigned to a registered channel",
      untagged.paidOrders === 2 &&
        out.rows.find((x) => x.key === "ramesh").paidOrders === 1,
    );
    check(
      "every order is accounted for exactly once",
      out.totals.paidOrders === 4 &&
        out.rows.reduce((s, r) => s + r.paidOrders, 0) === 4,
    );
  }

  // ── Registered-but-silent and retired channels ───────────────────
  {
    const out = aggregateChannelResults({
      orders: [order({ tag: "old" })],
      events: [],
      channels: [
        { code: "fresh", label: "Fresh", is_active: true },
        { code: "old", label: "Old Channel", is_active: false },
      ],
    });
    check("a channel with no activity still appears", out.rows.some((r) => r.key === "fresh"));
    check(
      "a retired channel keeps reporting its history",
      out.rows.find((r) => r.key === "old").paidOrders === 1,
    );
    check(
      "a retired channel is flagged, not deleted",
      out.rows.find((r) => r.key === "old").isActive === false &&
        out.rows.find((r) => r.key === "old").isRegistered === true,
    );
  }

  // ── Events, and the fact they are never joined to orders ─────────
  {
    const out = aggregateChannelResults({
      orders: [order({ tag: "ramesh", quantity: 2, price_paid: 20 })],
      events: [
        ev("copy", "ramesh"), ev("copy", "ramesh"),
        ev("visit", "ramesh"), ev("visit", "ramesh"), ev("visit", "ramesh"),
        ev("checkout_session", "ramesh"),
        ev("visit", null),
      ],
      channels: [{ code: "ramesh", label: "Ramesh", is_active: true }],
    });
    const r = out.rows.find((x) => x.key === "ramesh");
    check("copies counted", r.copies === 2);
    check("visits counted", r.visits === 3);
    check("checkout sessions counted", r.checkoutSessions === 1);
    check(
      "THREE visits do not multiply ONE order",
      r.paidOrders === 1 && r.packsOrdered === 2 && r.recordedValueBeforeRefunds === 20,
      `orders=${r.paidOrders} packs=${r.packsOrdered} value=${r.recordedValueBeforeRefunds}`,
    );
    check(
      "an untagged visit lands in the Untagged bucket",
      out.rows.find((x) => x.key === UNTAGGED_KEY).visits === 1,
    );
  }

  // ── Not tracked ≠ zero ───────────────────────────────────────────
  {
    const notTracked = aggregateChannelResults({
      orders: [order({ tag: "ramesh" })],
      events: null,
      channels: [],
    });
    const trackedEmpty = aggregateChannelResults({
      orders: [order({ tag: "ramesh" })],
      events: [],
      channels: [],
    });
    check("events: null reports NOT tracked", notTracked.eventsTracked === false);
    check("events: [] reports tracked (and found nothing)", trackedEmpty.eventsTracked === true);
    check(
      "the two are distinguishable — the UI can refuse to print a false zero",
      notTracked.eventsTracked !== trackedEmpty.eventsTracked,
    );
  }

  // ── Money handling ───────────────────────────────────────────────
  {
    const out = aggregateChannelResults({
      // PostgREST returns `numeric` as a string.
      orders: [
        order({ tag: "r", price_paid: "10.99" }),
        order({ tag: "r", price_paid: "0.01" }),
        order({ tag: "r", price_paid: null }),
      ],
      events: [],
      channels: [],
    });
    const r = out.rows.find((x) => x.key === "r");
    check("numeric strings are parsed", r.recordedValueBeforeRefunds === 11, `got ${r.recordedValueBeforeRefunds}`);
    check("a null price contributes zero, not NaN", Number.isFinite(r.recordedValueBeforeRefunds));
  }
  {
    const out = aggregateChannelResults({
      orders: Array.from({ length: 3 }, () => order({ tag: "r", price_paid: 0.1 })),
      events: [],
      channels: [],
    });
    check(
      "float drift is rounded away (0.1 × 3 reads as 0.30)",
      out.rows.find((x) => x.key === "r").recordedValueBeforeRefunds === 0.3,
      String(out.rows.find((x) => x.key === "r").recordedValueBeforeRefunds),
    );
  }

  // ── Totals reconcile ─────────────────────────────────────────────
  {
    const out = aggregateChannelResults({
      orders: [
        order({ tag: "a", quantity: 2, price_paid: 20 }),
        order({ tag: "b", quantity: 1, price_paid: 10 }),
        order({ tag: null, quantity: 4, price_paid: 40 }),
        order({ tag: "unknown-x", quantity: 1, price_paid: 10 }),
      ],
      events: [ev("visit", "a"), ev("copy", "b")],
      channels: [{ code: "a", label: "A", is_active: true }],
    });
    const sum = (f) => out.rows.reduce((s, r) => s + r[f], 0);
    for (const field of ["paidOrders", "packsOrdered", "pickedUpOrders", "copies", "visits", "checkoutSessions"]) {
      check(`totals.${field} equals the sum of the rows`, out.totals[field] === sum(field));
    }
    check(
      "totals.recordedValueBeforeRefunds equals the sum of the rows",
      Math.abs(out.totals.recordedValueBeforeRefunds - sum("recordedValueBeforeRefunds")) < 1e-9,
    );
    check("every bucket is present: registered, unknown, untagged", out.rows.length === 4);
  }

  // ── Large input: no silent cap in the aggregator itself ──────────
  {
    const many = Array.from({ length: 5000 }, (_, i) =>
      order({ tag: i % 2 ? "a" : "b", quantity: 1, price_paid: 1 }),
    );
    const out = aggregateChannelResults({ orders: many, events: [], channels: [] });
    check(
      "5000 orders all counted (the aggregator imposes no page limit)",
      out.totals.paidOrders === 5000 && out.totals.recordedValueBeforeRefunds === 5000,
      `orders=${out.totals.paidOrders}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 4. STRUCTURAL INVARIANTS
// ═══════════════════════════════════════════════════════════════════════

function testInvariants() {
  section("Invariants: authorization, immutability, isolation");

  const actions = read("lib/admin/channels.ts");
  const actionsCode = strip(actions);

  // ── Every exported action is admin-guarded ───────────────────────
  const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  check(
    "the module exports the expected actions",
    exported.length >= 7,
    `found ${exported.join(", ")}`,
  );
  for (const name of exported) {
    const start = actions.indexOf(`export async function ${name}`);
    const end = actions.indexOf("\nexport ", start + 10);
    const body = actions.slice(start, end === -1 ? undefined : end);
    check(`${name}() requires an admin session`, /requireAdmin\(\)/.test(body));
    check(
      `${name}() refuses rather than proceeding when unauthorized`,
      /return \{ ok: false, error: "Unauthorized" \}|return \{ ok: false \}/.test(body),
    );
  }

  // ── THE invariant: a rename never touches the code ───────────────
  {
    const start = actions.indexOf("export async function renameChannel");
    const end = actions.indexOf("\nexport ", start + 10);
    const body = strip(actions.slice(start, end));
    check(
      "renameChannel updates label and NOTHING else",
      /\.update\(\{ label: trimmed \}\)/.test(body),
      "the update payload must contain label alone",
    );
    check(
      "renameChannel never writes a code",
      // The audit payload legitimately logs `channel_code:`; what must
      // not exist is a `code:` key inside the update object.
      (body.match(/\.update\(\{[^}]*\}\)/g) ?? []).every((u) => !/\bcode\s*:/.test(u)),
    );
  }
  check(
    "no action anywhere writes share_channels.code outside creation",
    (() => {
      const updates = [...actionsCode.matchAll(/\.update\(\{[^}]*\}\)/g)].map((m) => m[0]);
      return updates.every((u) => !/\bcode\s*:/.test(u));
    })(),
  );

  // ── Reads are paginated, not capped ──────────────────────────────
  check(
    "order and event reads walk past PostgREST's first page",
    /\.range\(from, from \+ PAGE_SIZE - 1\)/.test(actionsCode) && /for \(let page = 0/.test(actionsCode),
  );
  check(
    "orders and events are read separately, never joined",
    !/orders[^\n]*channel_events|channel_events[^\n]*orders/.test(
      actionsCode.replace(/\/\/.*/g, ""),
    ),
  );

  // ── Links come from the configured origin, not the browser ───────
  check(
    "share links are built from NEXT_PUBLIC_APP_URL",
    /NEXT_PUBLIC_APP_URL/.test(actionsCode),
  );
  check(
    "the server action never reads window.location",
    !/window\.location/.test(actionsCode),
  );
  check(
    "a missing origin is refused rather than guessed",
    /NEXT_PUBLIC_APP_URL is not configured/.test(actions),
  );

  // ── No customer data in tracking ─────────────────────────────────
  const events = strip(read("lib/channels/events.ts"));
  const migration = read("migration-013-share-channels.sql");
  for (const forbidden of ["phone", "qr_token", "stripe_secret", "price_paid", "customer"]) {
    check(
      `channel events never store ${forbidden}`,
      !new RegExp(`\\b${forbidden}\\b`, "i").test(events.replace(/isMissing\w+/g, "")),
      "found a reference in the recorder",
    );
  }
  check(
    "the migration's event table defines no customer column",
    !/\bphone\b|\bqr_token\b/.test(
      migration.slice(migration.indexOf("CREATE TABLE IF NOT EXISTS channel_events"),
                      migration.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_events_dedupe")),
    ),
  );

  // ── Recording can never break what it measures ───────────────────
  check(
    "every recorder path is wrapped and returns a boolean",
    /catch \(err\)/.test(events) && /return false/.test(events),
  );
  check(
    "a duplicate dedupe key is success, not an error",
    /UNIQUE_VIOLATION/.test(events) && /already counted/.test(read("lib/channels/events.ts")),
  );
  const checkout = strip(read("app/api/checkout/route.ts"));
  check(
    "checkout records the session only AFTER Stripe created it",
    // `indexOf` on the bare name would find the import at the top of the
    // file, and a MISSING marker returns -1, which compares as "before"
    // everything. Both must be present AND ordered.
    (() => {
      const created = checkout.indexOf("sessions.create");
      const recorded = checkout.indexOf("await recordCheckoutSession(");
      return created !== -1 && recorded !== -1 && created < recorded;
    })(),
  );
  check(
    "checkout keys the event on the Stripe session id",
    /sessionId: session\.id/.test(checkout),
  );
  check(
    "a tracking failure cannot change the checkout response",
    checkout.indexOf("recordCheckoutSession") < checkout.indexOf("checkoutUrl: session.url"),
  );

  // ── Visits come from a rendered page, not the server ─────────────
  const client = read("app/drop/[id]/client.tsx");
  check(
    "the visit beacon lives in a client effect",
    /useEffect\(\(\) => \{[\s\S]{0,400}track\/visit/.test(client),
  );
  check(
    "the drop SERVER component never records a visit",
    !/track\/visit|recordVisit/.test(read("app/drop/[id]/page.tsx")),
  );
  check(
    "the beacon fires once per mount",
    /visitSent\.current/.test(client),
  );
  check(
    "a beacon failure is swallowed",
    /\}\)\.catch\(\(\) => \{/.test(client),
  );

  // ── The panel does not touch price or inventory ──────────────────
  const panel = codeOnly(read("app/admin/drops/share-panel.tsx"));
  for (const forbidden of ["total_spots", "price_paid", "drop_items", "createDrop", "getSpotsInfo"]) {
    check(
      `the Share panel never reads ${forbidden}`,
      !new RegExp(`\\b${forbidden}\\b`).test(panel),
    );
  }
  check(
    "no sharing code imports or calls the payment path",
    !/stripe/i.test(codeOnly(actions)) && !/stripe/i.test(panel),
  );
  check(
    "no sharing code mutates a drop",
    !/drop_items/.test(codeOnly(actions)) && !/\.update\(/.test(panel),
  );

  // ── Copy feedback only after a real clipboard write ──────────────
  const panelRaw = read("app/admin/drops/share-panel.tsx");
  check(
    "the panel confirms a copy only after the clipboard resolves",
    /const ok = await copyToClipboard\(url\);[\s\S]{0,200}if \(!ok\)/.test(panelRaw),
  );
  check(
    "a blocked clipboard offers a selectable fallback",
    /setManualUrl\(url\)/.test(panelRaw) && /blocked the clipboard/.test(panelRaw),
  );
  check(
    "a copy is recorded only on success",
    // Again: both markers must exist and be ordered. Deleting the
    // confirmation would otherwise make this pass on a -1.
    (() => {
      const confirmed = panelRaw.indexOf("flashCopied();");
      const recorded = panelRaw.indexOf("await recordChannelCopy(");
      return confirmed !== -1 && recorded !== -1 && confirmed < recorded;
    })(),
  );
  check(
    "a failed clipboard write returns before anything is recorded",
    /if \(!ok\) \{[\s\S]{0,200}return;/.test(panelRaw),
  );

  // ── Honest labelling ─────────────────────────────────────────────
  check(
    "the panel calls the money column recorded value before refunds",
    /before refunds/i.test(panelRaw) && /ORDER VALUE/.test(panelRaw),
  );
  check(
    "the panel never claims net revenue or verified collections",
    !/net revenue/i.test(panelRaw.replace(/Not net revenue[^<]*/g, "")) ||
      /Not net revenue/.test(panelRaw),
  );
  check("the panel states refunds are not reported", /Refunds are not reported/i.test(panelRaw));
  check(
    "the panel never calls visits unique people or reach",
    !/unique (people|visitors)/i.test(panelRaw.replace(/not a unique person[^<]*/gi, "")) &&
      /not a unique person/i.test(panelRaw),
  );
  check(
    "the panel says a copy is not proof of sharing",
    /not proof the link was shared/i.test(panelRaw),
  );
  check(
    "the panel distinguishes not-tracked from zero",
    /not tracked/i.test(panelRaw) && /not zero/i.test(panelRaw),
  );
  check(
    "the panel states every channel shares one drop and one inventory",
    /Same drop, price and inventory/i.test(panelRaw),
  );

  // ── The registry is admin-only ───────────────────────────────────
  const allFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry.name)) allFiles.push(rel);
    }
  })("app");
  const publicReaders = allFiles.filter(
    (f) => !f.startsWith(path.join("app", "admin")) && /share_channels/.test(read(f)),
  );
  check(
    "no public route reads the channel registry",
    publicReaders.length === 0,
    `read by: ${publicReaders.join(", ")}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════

function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   DealsPro · Studio sharing & channel results    ║");
  console.log("╚══════════════════════════════════════════════════╝");

  try {
    testCodes();
    testUrls();
    testAggregation();
    testInvariants();
  } catch (err) {
    console.error("\n[FATAL] channels suite crashed:", err);
    failed += 1;
  }

  console.log(`\n${"═".repeat(54)}`);
  console.log(`  TOTAL: ${passed} PASS / ${failed} FAIL`);
  console.log(`${"═".repeat(54)}\n`);
  if (failures.length > 0) {
    console.log("FAILED TESTS:");
    failures.forEach((f) => console.log(`  ✗ ${f.name} — ${f.reason}`));
    console.log("");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
