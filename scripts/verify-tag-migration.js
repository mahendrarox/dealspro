#!/usr/bin/env node
/**
 * Post-apply verification for the order channel-attribution migration.
 *
 * Proves two things against a REAL database, after the migration has been
 * applied by an operator:
 *
 *   1. BACKWARD COMPATIBILITY — the original 9-argument call still
 *      resolves and still creates an order, with `tag` null. Every
 *      deployed caller and all 23 call sites in scripts/test-regression.js
 *      use that signature, so if this fails the migration has broken
 *      checkout.
 *   2. FORWARD BEHAVIOUR — the 10-argument call writes the tag through.
 *
 * It creates two orders and deletes both before exiting, including on
 * failure. It writes nothing else.
 *
 * ─── TARGETING ──────────────────────────────────────────────────────
 * This script WRITES. It refuses to run unless you name the project you
 * mean and that name matches the configured SUPABASE_URL:
 *
 *   node scripts/verify-tag-migration.js --allow-target <project-ref>
 *
 * The production project ref is refused unconditionally — there is no
 * flag, env var or argument that enables it. Run this against an isolated
 * project only.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env.local") });

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// ═══════════════════════════════════════════════════════════════════════
// REFUSALS — enforced in code, before any client is constructed
// ═══════════════════════════════════════════════════════════════════════

/**
 * Never, under any circumstances, against this project. Not a comment,
 * not a default, not overridable: the string is compared against the
 * resolved host and the process exits.
 */
const FORBIDDEN_HOST_FRAGMENT = "lyqpqlkafozdujzgejbg";

function die(message) {
  console.error(`\n  REFUSED — ${message}\n`);
  process.exit(2);
}

function parseAllowTarget(argv) {
  const i = argv.indexOf("--allow-target");
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) return null;
  return value.trim();
}

function resolveTarget() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) die("NEXT_PUBLIC_SUPABASE_URL is not set — nothing to target.");

  let host;
  try {
    host = new URL(url).host;
  } catch {
    die(`NEXT_PUBLIC_SUPABASE_URL is not a URL: ${String(url).slice(0, 40)}`);
  }

  // 1. The hard refusal. Checked first, so no flag can reach past it.
  if (host.includes(FORBIDDEN_HOST_FRAGMENT)) {
    die(
      `target host ${host} is the production project. This script writes ` +
        `orders and will never run against it. Point SUPABASE_URL at an ` +
        `isolated project.`,
    );
  }

  // 2. The operator must name the project they mean.
  const allow = parseAllowTarget(process.argv);
  if (!allow) {
    die(
      "no --allow-target given. Re-run as:\n" +
        "    node scripts/verify-tag-migration.js --allow-target <project-ref>\n" +
        `  The configured target is ${host}.`,
    );
  }
  if (allow.includes(FORBIDDEN_HOST_FRAGMENT)) {
    die("--allow-target names the production project. Refused.");
  }

  // 3. And that name must match what is actually configured, so a stale
  //    .env.local cannot quietly send this somewhere else.
  if (!host.includes(allow)) {
    die(
      `--allow-target "${allow}" does not match the configured host ` +
        `"${host}". Refusing rather than guessing which one you meant.`,
    );
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) die("SUPABASE_SERVICE_ROLE_KEY is not set.");

  return { url, host, key };
}

// ═══════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } else {
    failed += 1;
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const testId = () => `tagverify_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

async function main() {
  const target = resolveTarget();
  console.log(`\n  Target: ${target.host}  (approved via --allow-target)\n`);

  const db = createClient(target.url, target.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const DROP_ID = `tagverify-drop-${Date.now()}`;
  const sessions = [];

  const baseArgs = (sid) => ({
    p_stripe_session_id: sid,
    p_phone: `+1999${String(Date.now()).slice(-7)}`,
    p_drop_item_id: DROP_ID,
    p_drop_title: "Tag verification",
    p_restaurant_name: "Tag verification",
    p_price_paid: 0,
    p_quantity: 1,
    p_qr_token: testId(),
    p_total_spots: 100,
  });

  try {
    // ── 1. The existing 9-argument signature still works ─────────────
    console.log("── 9-argument call (every deployed caller) ──");
    const sid9 = testId();
    sessions.push(sid9);
    const nine = await db.rpc("create_order_atomic", baseArgs(sid9));

    check(
      "9-arg call resolves (no PGRST202)",
      nine.error?.code !== "PGRST202",
      nine.error ? `${nine.error.code}: ${nine.error.message}` : "",
    );
    check("9-arg call succeeds", !nine.error, nine.error?.message ?? "");
    check(
      "9-arg call created an order",
      nine.data?.status === "created",
      `status=${nine.data?.status}`,
    );

    if (!nine.error) {
      const { data: row } = await db
        .from("orders")
        .select("id, tag")
        .eq("stripe_session_id", sid9)
        .maybeSingle();
      check("9-arg order exists", Boolean(row), "row not found");
      check(
        "9-arg order has tag = NULL (the default applied)",
        row ? row.tag === null : false,
        `tag=${JSON.stringify(row?.tag)}`,
      );
    }

    // ── 2. The 10-argument signature writes the tag ──────────────────
    console.log("\n── 10-argument call (p_tag) ──");
    const sid10 = testId();
    sessions.push(sid10);
    const ten = await db.rpc("create_order_atomic", {
      ...baseArgs(sid10),
      p_tag: "verify_test",
    });

    check(
      "10-arg call resolves (p_tag is on the signature)",
      ten.error?.code !== "PGRST202",
      ten.error ? `${ten.error.code}: ${ten.error.message}` : "",
    );
    check("10-arg call succeeds", !ten.error, ten.error?.message ?? "");
    check(
      "10-arg call created an order",
      ten.data?.status === "created",
      `status=${ten.data?.status}`,
    );

    if (!ten.error) {
      const { data: row } = await db
        .from("orders")
        .select("id, tag")
        .eq("stripe_session_id", sid10)
        .maybeSingle();
      check("10-arg order exists", Boolean(row), "row not found");
      check(
        "10-arg order stored tag = 'verify_test'",
        row ? row.tag === "verify_test" : false,
        `tag=${JSON.stringify(row?.tag)}`,
      );
    }
  } finally {
    // ── Cleanup, including on failure ────────────────────────────────
    let removed = 0;
    for (const sid of sessions) {
      const { data } = await db
        .from("orders")
        .delete()
        .eq("stripe_session_id", sid)
        .select("id");
      removed += (data ?? []).length;
    }
    console.log(`\n  Cleaned up ${removed} verification order(s).`);
    const { data: leftovers } = await db
      .from("orders")
      .select("id")
      .like("stripe_session_id", "tagverify_%");
    if ((leftovers ?? []).length > 0) {
      console.log(
        `  WARNING: ${leftovers.length} tagverify_ order(s) remain — remove them manually.`,
      );
    }
  }

  console.log(`\n${"═".repeat(54)}`);
  console.log(`  TOTAL: ${passed} PASS / ${failed} FAIL`);
  console.log(`${"═".repeat(54)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
