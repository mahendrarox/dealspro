#!/usr/bin/env node
/**
 * Channel attribution (?tag=) — focused suite.
 *
 * Everything provable without a database or a running server: the
 * normalizer's exact behaviour, URL building, and structural invariants
 * over the five places the value crosses a boundary.
 *
 * What is NOT here, deliberately: anything that depends on the body of
 * `create_order_atomic`. That function lives only in the production
 * database and has never been in version control, so asserting what it
 * does with p_tag would be asserting what I guessed it does.
 *
 * Run: npm run test:attribution
 */

const path = require("path");
const fs = require("fs");

try {
  require("tsx/cjs/api").register();
} catch {
  console.error("[attribution] tsx is required to run this suite (npm i)");
  process.exit(1);
}

const {
  normalizeTag,
  appendTag,
  tagFromSearchParams,
  TAG_MAX_LENGTH,
  TAG_PARAM,
} = require(path.resolve(__dirname, "../lib/attribution/tag.ts"));

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

// ═══════════════════════════════════════════════════════════════════════
// 1. NORMALIZER
// ═══════════════════════════════════════════════════════════════════════

function testNormalizer() {
  section("Normalizer: trim → lowercase → validate, nothing stripped");

  // The cases named in the spec, verbatim.
  const cases = [
    ["Ramesh", "ramesh", "case folded"],
    [" ramesh ", "ramesh", "trimmed"],
    ["ram esh", null, "inner space is a rejection, NOT a strip"],
    ["a".repeat(65), null, "65 characters"],
    ["", null, "empty string"],
    [undefined, null, "undefined"],
  ];
  for (const [input, expected, label] of cases) {
    const got = normalizeTag(input);
    check(
      `normalizeTag(${JSON.stringify(input)}) → ${JSON.stringify(expected)} (${label})`,
      got === expected,
      `got ${JSON.stringify(got)}`,
    );
  }

  // Boundary: 64 in, 65 out.
  check(
    `normalizeTag(64 chars) is accepted (TAG_MAX_LENGTH=${TAG_MAX_LENGTH})`,
    normalizeTag("a".repeat(64)) === "a".repeat(64),
  );
  check("normalizeTag(1 char) is accepted", normalizeTag("a") === "a");

  // The full permitted alphabet, and that case folding reaches all of it.
  check(
    "normalizeTag preserves digits, underscore and hyphen",
    normalizeTag("Ab_9-Zz") === "ab_9-zz",
    `got ${JSON.stringify(normalizeTag("Ab_9-Zz"))}`,
  );

  // Rejections. Each of these would, if stripped instead of rejected,
  // silently merge two different channels into one.
  const rejects = [
    ["ramesh patel", "space"],
    ["ramesh.patel", "dot"],
    ["ramesh@x", "at sign"],
    ["ramesh/x", "slash"],
    ["ramesh%20x", "percent"],
    ["ramesh+x", "plus"],
    ["ramesh?x=1", "query characters"],
    ["ramesh#frag", "fragment"],
    ["ramesh\tx", "tab"],
    ["ramesh\nx", "newline"],
    ["ramésh", "non-ASCII letter"],
    ["рамеш", "Cyrillic"],
    ["<script>", "angle brackets"],
    ["'; DROP TABLE orders;--", "SQL-shaped input"],
    ["../../etc/passwd", "path traversal"],
    ["\u0000", "NUL"],
  ];
  for (const [input, label] of rejects) {
    check(
      `normalizeTag rejects ${label}`,
      normalizeTag(input) === null,
      `got ${JSON.stringify(normalizeTag(input))}`,
    );
  }

  // Non-string inputs: every caller receives an untyped value.
  const nonStrings = [
    [null, "null"],
    [42, "number"],
    [true, "boolean"],
    [{}, "object"],
    [["a", "b"], "array (a repeated ?tag=a&tag=b)"],
    [["a"], "single-element array"],
  ];
  for (const [input, label] of nonStrings) {
    check(
      `normalizeTag rejects ${label}`,
      normalizeTag(input) === null,
      `got ${JSON.stringify(normalizeTag(input))}`,
    );
  }

  // Whitespace-only collapses to empty, which is a rejection.
  check("normalizeTag('   ') → null", normalizeTag("   ") === null);
  check("normalizeTag('\\t\\n') → null", normalizeTag("\t\n") === null);

  // Idempotent: normalizing an already-normal tag changes nothing. This
  // is what makes re-normalizing at every boundary safe.
  const normal = normalizeTag("  Ramesh_K-9  ");
  check(
    "normalizeTag is idempotent (safe to re-apply at each boundary)",
    normalizeTag(normal) === normal && normal === "ramesh_k-9",
    `normal=${JSON.stringify(normal)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2. URL BUILDING
// ═══════════════════════════════════════════════════════════════════════

function testAppendTag() {
  section("appendTag: forwards a tag, never invents one");

  check("appendTag with null leaves the path untouched", appendTag("/drop/x", null) === "/drop/x");
  check(
    "appendTag with a tag appends ?tag=",
    appendTag("/drop/x", "ramesh") === "/drop/x?tag=ramesh",
    appendTag("/drop/x", "ramesh"),
  );
  check(
    "appendTag uses & when a query already exists",
    appendTag("/drop/x?qty=2", "ramesh") === "/drop/x?qty=2&tag=ramesh",
    appendTag("/drop/x?qty=2", "ramesh"),
  );
  check("appendTag with empty string is a no-op", appendTag("/drop/x", "") === "/drop/x");
  check(`TAG_PARAM is "tag"`, TAG_PARAM === "tag");

  // Round trip through a real URL parser: what appendTag writes is what
  // tagFromSearchParams reads back.
  for (const tag of ["ramesh", "a", "a".repeat(64), "a_b-9"]) {
    const url = new URL(appendTag("/drop/x", tag), "https://example.test");
    const parsed = Object.fromEntries(url.searchParams.entries());
    check(
      `round trip: appendTag → URL → tagFromSearchParams preserves "${tag.slice(0, 12)}"`,
      tagFromSearchParams(parsed) === tag,
      `got ${JSON.stringify(tagFromSearchParams(parsed))}`,
    );
  }

  check(
    "tagFromSearchParams on an absent key → null",
    tagFromSearchParams({}) === null,
  );
  check(
    "tagFromSearchParams on undefined params → null",
    tagFromSearchParams(undefined) === null,
  );
  check(
    "tagFromSearchParams normalizes what it finds",
    tagFromSearchParams({ tag: " Ramesh " }) === "ramesh",
  );
  check(
    "tagFromSearchParams rejects a repeated param",
    tagFromSearchParams({ tag: ["a", "b"] }) === null,
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. END-TO-END SHAPE (URL → body → metadata → p_tag)
// ═══════════════════════════════════════════════════════════════════════

/**
 * The value is re-normalized at three boundaries. Simulate all three and
 * assert the tag that reaches the RPC argument equals the tag the URL
 * carried — for valid input — and is null for invalid input, at whichever
 * boundary the invalidity is introduced.
 */
function testRoundTrip() {
  section("Round trip: URL → checkout body → Stripe metadata → p_tag");

  const hop = (urlValue) => {
    const fromUrl = tagFromSearchParams({ tag: urlValue }); // page
    const body = fromUrl ? { tag: fromUrl } : {}; // client → API
    const atApi = normalizeTag(body.tag); // checkout API
    const metadata = atApi ? { tag: atApi } : {}; // → Stripe
    const atWebhook = normalizeTag(metadata.tag); // webhook
    return { fromUrl, atApi, atWebhook };
  };

  for (const [input, expected] of [
    ["ramesh", "ramesh"],
    ["Ramesh", "ramesh"],
    ["  RAMESH  ", "ramesh"],
    ["a_b-9", "a_b-9"],
    ["ram esh", null],
    ["", null],
    ["a".repeat(65), null],
  ]) {
    const { atWebhook } = hop(input);
    check(
      `round trip ${JSON.stringify(input)} → p_tag ${JSON.stringify(expected)}`,
      atWebhook === expected,
      `got ${JSON.stringify(atWebhook)}`,
    );
  }

  // A tampered metadata value — someone replays a signed event with a
  // crafted tag — is rejected at the webhook, not written through.
  check(
    "a tampered metadata tag is rejected at the webhook boundary",
    normalizeTag("ram esh; DROP TABLE orders") === null,
  );
  check(
    "a tampered metadata tag that happens to be valid is still bounded",
    normalizeTag("a".repeat(200)) === null,
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 4. STRUCTURAL INVARIANTS
// ═══════════════════════════════════════════════════════════════════════

function testInvariants() {
  section("Invariants: where the tag may and may not appear");

  // ── T1: the drop page reads server-side; the client does not ──────
  const dropPage = read("app/drop/[id]/page.tsx");
  const dropClient = read("app/drop/[id]/client.tsx");

  check(
    "T1: /drop/[id]/page.tsx accepts searchParams",
    /searchParams\s*:/.test(dropPage) && /searchParams\s*,/.test(dropPage),
  );
  check(
    "T1: the page normalizes through lib/attribution",
    /tagFromSearchParams\(/.test(dropPage) &&
      /@\/lib\/attribution\/tag/.test(dropPage),
  );
  check(
    "T1: the page passes tag down as a prop",
    /<DealClient[^>]*tag=\{tag\}/.test(dropPage.replace(/\n/g, " ")),
  );
  check(
    "T1: the CLIENT never reads the URL itself (no hydration gap)",
    !/useSearchParams/.test(dropClient) &&
      !/location\.search/.test(dropClient) &&
      !/URLSearchParams/.test(dropClient),
  );
  check(
    "T1: the client sends tag in the checkout body",
    /\.\.\.\(tag \? \{ tag \} : \{\}\)/.test(dropClient),
  );

  // ── T2: both /r/[slug] modes forward the tag ──────────────────────
  const smartUrl = read("app/r/[slug]/page.tsx");
  check(
    "T2: /r/[slug] accepts searchParams and normalizes",
    /searchParams\s*:/.test(smartUrl) && /tagFromSearchParams\(/.test(smartUrl),
  );
  check(
    "T2: redirect mode forwards the tag",
    /redirect\(appendTag\(`\/drop\/\$\{claimable\[0\]\.id\}`, tag\)\)/.test(smartUrl),
  );
  check(
    "T2: list mode forwards the tag on every link",
    /href=\{appendTag\(`\/drop\/\$\{drop\.id\}`, tag\)\}/.test(smartUrl),
  );
  check(
    "T2: no bare /drop/ link remains in /r/[slug]",
    !/href=\{`\/drop\/\$\{drop\.id\}`\}/.test(smartUrl) &&
      !/redirect\(`\/drop\/\$\{claimable\[0\]\.id\}`\)/.test(smartUrl),
  );
  // The no-store header is what stops a CDN serving one visitor's tagged
  // redirect to the next. Removing it would silently corrupt attribution.
  const nextConfig = read("next.config.ts");
  check(
    "T2: /r/:slug keeps its Cache-Control: no-store header",
    /source:\s*"\/r\/:slug"/.test(nextConfig) && /no-store/.test(nextConfig),
  );

  // ── T3: checkout ──────────────────────────────────────────────────
  const checkout = read("app/api/checkout/route.ts");
  check(
    "T3: checkout re-normalizes the body tag server-side",
    /const tag = normalizeTag\(body\?\.tag\)/.test(checkout),
  );
  check(
    "T3: metadata.tag is set only when valid",
    /\.\.\.\(tag \? \{ tag \} : \{\}\)/.test(checkout),
  );
  check(
    "T3: a missing or invalid tag cannot block checkout",
    // No early return, no status code, no error message mentions the tag.
    !/if\s*\(\s*!tag\s*\)/.test(checkout) &&
      !/tag[^\n]*status:\s*4\d\d/.test(checkout),
  );

  // ── T4: webhook ───────────────────────────────────────────────────
  const webhook = read("app/api/webhook/stripe/route.ts");
  check(
    "T4: the webhook re-sanitizes the metadata tag",
    /const tag = normalizeTag\(session\.metadata\?\.tag\)/.test(webhook),
  );
  check(
    "T4: p_tag is passed to the RPC",
    /p_tag:\s*tag/.test(webhook),
  );
  check(
    "T4: the existing nine arguments keep their order",
    (() => {
      const order = [
        "p_stripe_session_id",
        "p_phone",
        "p_drop_item_id",
        "p_drop_title",
        "p_restaurant_name",
        "p_price_paid",
        "p_quantity",
        "p_qr_token",
        "p_total_spots",
        "p_tag",
      ];
      const positions = order.map((k) => webhook.indexOf(`${k}:`));
      return positions.every((p, i) => p !== -1 && (i === 0 || p > positions[i - 1]));
    })(),
  );
  check(
    "T4: a signature mismatch falls back rather than losing a paid order",
    // Delegated to lib/orders/create-order-rpc.ts, which is unit-tested
    // below. What matters here is that the route routes through it.
    /callCreateOrderAtomic\(/.test(webhook) &&
      /@\/lib\/orders\/create-order-rpc/.test(webhook),
  );

  // ── T8: the tag never reaches a customer-facing response ──────────
  const orderRoute = read("app/api/order/route.ts");
  const pollRoute = read("app/api/order/poll/route.ts");
  for (const [label, src] of [
    ["app/api/order/route.ts", orderRoute],
    ["app/api/order/poll/route.ts", pollRoute],
  ]) {
    check(
      `T8: ${label} no longer selects "*"`,
      !/\.select\("\*"\)/.test(src),
    );
    check(
      `T8: ${label} does not select the tag column`,
      !/\btag\b/.test(src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    );
  }

  // Customer-facing surfaces must not name the column at all.
  const customerFacing = [
    "app/ticket/[token]/page.tsx",
    "app/ticket/success/page.tsx",
    "components/SuccessClient.tsx",
    "components/TicketCard.tsx",
  ];
  for (const p of customerFacing) {
    const src = read(p).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    check(
      `T8: ${p} never references an order tag`,
      !/order[!?]?\.tag\b/.test(src) && !/"tag"/.test(src),
    );
  }

  // ── Import boundary: never lib/intake ─────────────────────────────
  const tagModule = read("lib/attribution/tag.ts");
  check(
    "Boundary: lib/attribution/tag.ts imports nothing (no intake coupling)",
    !/^\s*import\s/m.test(tagModule),
  );
  for (const p of [
    "app/drop/[id]/page.tsx",
    "app/r/[slug]/page.tsx",
    "app/api/checkout/route.ts",
  ]) {
    check(
      `Boundary: ${p} still imports nothing from lib/intake`,
      !/lib\/intake/.test(read(p)),
    );
  }

  // ── Never logged ──────────────────────────────────────────────────
  // A tag is not a secret, but it is attribution data about a person's
  // referral path, and the webhook's `all_metadata` line already carries
  // it. No module should add a second, narrower leak.
  for (const [label, src] of [
    ["checkout", checkout],
    ["webhook", webhook],
  ]) {
    check(
      `Privacy: ${label} has no console line printing the tag value alone`,
      !/console\.(log|error|warn|info)\([^)]*\btag\b[^)]*\)/.test(src),
    );
  }

  // ── Duplicate delivery: the structural half ───────────────────────
  // The behavioural half (what create_order_atomic does on conflict) is
  // NOT asserted here: that function is production-only and has never been
  // in version control. What IS provable from the repo is that the unique
  // index exists and that a retried webhook presents the same session id.
  const baseMigration = read("migration.sql");
  check(
    "Duplicate delivery: uq_stripe_session is a UNIQUE index on orders",
    /CREATE UNIQUE INDEX uq_stripe_session ON orders \(stripe_session_id\)/.test(
      baseMigration,
    ),
  );
  check(
    "Duplicate delivery: the webhook keys the RPC on the Stripe session id",
    /p_stripe_session_id:\s*stripeSessionId/.test(webhook) &&
      /const stripeSessionId = session\.id/.test(webhook),
  );
}


// ═══════════════════════════════════════════════════════════════════════
// 5. RPC SIGNATURE FALLBACK (unit, no database)
// ═══════════════════════════════════════════════════════════════════════

const {
  callCreateOrderAtomic,
  SIGNATURE_MISMATCH,
  FALLBACK_REASON,
} = require(path.resolve(__dirname, "../lib/orders/create-order-rpc.ts"));

const ARGS = Object.freeze({
  p_stripe_session_id: "cs_test_1",
  p_phone: "+13105550000",
  p_drop_item_id: "drop-1",
  p_drop_title: "Title",
  p_restaurant_name: "Restaurant",
  p_price_paid: 12,
  p_quantity: 1,
  p_qr_token: "qr-1",
  p_total_spots: 10,
  p_tag: "ramesh",
});

/** Records every argument set it is called with, and replays scripted outcomes. */
function recorder(outcomes) {
  const calls = [];
  const queue = [...outcomes];
  return {
    calls,
    call: async (args) => {
      calls.push(args);
      return queue.shift() ?? { data: null, error: null };
    },
  };
}

async function testFallback() {
  section("RPC fallback: a signature mismatch must never cost a paid order");

  // ── Happy path: one call, p_tag included, no fallback ─────────────
  {
    const r = recorder([{ data: { status: "created", order_id: "o1" }, error: null }]);
    const out = await callCreateOrderAtomic(r.call, { ...ARGS });
    check("Fallback: a successful call happens exactly once", r.calls.length === 1);
    check("Fallback: p_tag is sent on the first call", r.calls[0].p_tag === "ramesh");
    check("Fallback: usedFallback is false", out.usedFallback === false);
    check("Fallback: the result is passed through", out.data?.order_id === "o1");
  }

  // ── PGRST202: retry without p_tag ─────────────────────────────────
  {
    const r = recorder([
      { data: null, error: { code: SIGNATURE_MISMATCH, message: "no function matches" } },
      { data: { status: "created", order_id: "o2" }, error: null },
    ]);
    const seen = [];
    const out = await callCreateOrderAtomic(r.call, { ...ARGS }, (i) => seen.push(i));

    check("Fallback: PGRST202 triggers exactly one retry", r.calls.length === 2);
    check("Fallback: the retry omits p_tag entirely", !("p_tag" in r.calls[1]));
    check(
      "Fallback: the retry keeps all nine original arguments",
      Object.keys(r.calls[1]).length === 9 &&
        ["p_stripe_session_id","p_phone","p_drop_item_id","p_drop_title","p_restaurant_name",
         "p_price_paid","p_quantity","p_qr_token","p_total_spots"]
          .every((k) => r.calls[1][k] === ARGS[k]),
      JSON.stringify(Object.keys(r.calls[1])),
    );
    check(
      "Fallback: the nine arguments keep their order",
      JSON.stringify(Object.keys(r.calls[1])) ===
        JSON.stringify(Object.keys(ARGS).filter((k) => k !== "p_tag")),
    );
    check("Fallback: the order IS created on the retry", out.data?.order_id === "o2");
    check("Fallback: usedFallback is true", out.usedFallback === true);
    check("Fallback: the error from the first call is not surfaced", out.error === null);
    check("Fallback: the caller is told once", seen.length === 1);
    check("Fallback: it is told the reason", seen[0]?.reason === FALLBACK_REASON);
    check("Fallback: it is told a tag was dropped", seen[0]?.tagDropped === true);
  }

  // ── PGRST202 with no tag to lose ──────────────────────────────────
  {
    const r = recorder([
      { data: null, error: { code: SIGNATURE_MISMATCH } },
      { data: { status: "created" }, error: null },
    ]);
    const seen = [];
    await callCreateOrderAtomic(r.call, { ...ARGS, p_tag: null }, (i) => seen.push(i));
    check("Fallback: with p_tag null, tagDropped is false", seen[0]?.tagDropped === false);
    check("Fallback: it still retries (the signature is still wrong)", r.calls.length === 2);
  }

  // ── Every OTHER error passes straight through ─────────────────────
  for (const code of ["23505", "PGRST116", "42883", undefined]) {
    const r = recorder([{ data: null, error: { code, message: "boom" } }]);
    const out = await callCreateOrderAtomic(r.call, { ...ARGS });
    check(
      `Fallback: error code ${String(code)} is NOT retried`,
      r.calls.length === 1 && out.usedFallback === false && out.error?.message === "boom",
      `calls=${r.calls.length}`,
    );
  }

  // ── A retry that also fails returns the SECOND error ──────────────
  {
    const r = recorder([
      { data: null, error: { code: SIGNATURE_MISMATCH, message: "first" } },
      { data: null, error: { code: "23505", message: "second" } },
    ]);
    const out = await callCreateOrderAtomic(r.call, { ...ARGS });
    check(
      "Fallback: a failing retry surfaces the retry's own error",
      out.error?.message === "second" && out.usedFallback === true,
    );
  }

  // ── It never retries twice ────────────────────────────────────────
  {
    const r = recorder([
      { data: null, error: { code: SIGNATURE_MISMATCH } },
      { data: null, error: { code: SIGNATURE_MISMATCH } },
      { data: { status: "created" }, error: null },
    ]);
    const out = await callCreateOrderAtomic(r.call, { ...ARGS });
    check(
      "Fallback: it retries at most once, never loops",
      r.calls.length === 2 && out.error?.code === SIGNATURE_MISMATCH,
      `calls=${r.calls.length}`,
    );
  }

  // ── The caller's arguments are not mutated ────────────────────────
  {
    const args = { ...ARGS };
    const r = recorder([
      { data: null, error: { code: SIGNATURE_MISMATCH } },
      { data: { status: "created" }, error: null },
    ]);
    await callCreateOrderAtomic(r.call, args);
    check(
      "Fallback: the caller's argument object is left intact",
      args.p_tag === "ramesh" && Object.keys(args).length === 10,
    );
  }

  // ── The route uses the helper, not its own copy ───────────────────
  const webhookSrc = read("app/api/webhook/stripe/route.ts");
  check(
    "Fallback: the webhook calls the extracted helper",
    /callCreateOrderAtomic\(/.test(webhookSrc) &&
      /@\/lib\/orders\/create-order-rpc/.test(webhookSrc),
  );
  check(
    "Fallback: the webhook no longer carries an inline copy",
    (() => {
      // Comments stripped: the route explains in prose where the handling
      // lives, and that sentence is not an implementation.
      const code = webhookSrc
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "");
      return !/PGRST202/.test(code) && !/legacyArgs/.test(code);
    })(),
  );
  check(
    "Fallback: the log event name is unchanged",
    /webhook_rpc_signature_fallback/.test(webhookSrc),
  );
}

// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   DealsPro · Channel attribution (?tag=)         ║");
  console.log("╚══════════════════════════════════════════════════╝");

  try {
    testNormalizer();
    testAppendTag();
    testRoundTrip();
    testInvariants();
    await testFallback();
  } catch (err) {
    console.error("\n[FATAL] attribution suite crashed:", err);
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
