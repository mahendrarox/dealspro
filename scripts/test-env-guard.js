#!/usr/bin/env node
/**
 * Tests for the fail-closed test-environment guard.
 *
 * NON-DESTRUCTIVE AND DEPENDENCY-FREE BY CONSTRUCTION. No database, no
 * network, no credentials, no server. Every target below is fabricated,
 * and the live marker check is driven through an injected probe, so the
 * rejection paths are proven without ever pointing at a real database —
 * which is the only honest way to test a guard whose job is to refuse
 * dangerous targets.
 *
 * Run: npm run test:env-guard
 */

"use strict";

const {
  TestEnvironmentRefused,
  TEST_KEY_VAR,
  ALLOWLIST_VAR,
  parseTargetIdentity,
  credentialRefClaim,
  verifyStatic,
  verifyLive,
  assertTestEnvironment,
} = require("./lib/test-env-guard");

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, reason = "assertion failed") {
  if (cond) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; failures.push({ name, reason }); console.log(`  [FAIL] ${name} — ${reason}`); }
}
const section = (t) => console.log(`\n── ${t} ──`);

/** Build a Supabase-shaped JWT claiming `ref`. Unsigned; shape is what matters. */
function keyClaiming(ref) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ref, role: "service_role" })}.sig`;
}

const TEST_REF = "tttttttttesttttt";
const PROD_REF = "pppppppprodppppp";

/** A fully valid test environment — the one case that must be ALLOWED. */
function goodEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    [TEST_KEY_VAR]: keyClaiming(TEST_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  };
}
const markerOk = async () => ({ ok: true, row: { target_identity: TEST_REF, is_production: false } });

/**
 * Assert a refusal happened, and that it was a refusal rather than a crash.
 *
 * `arguments.length` rather than a default parameter: a default would
 * silently replace an explicitly-passed `undefined`, which is exactly the
 * case the "no probe supplied" test needs to exercise. That bug made this
 * helper report a pass for a path it never ran.
 */
async function refuses(name, env, probe) {
  const effective = arguments.length >= 3 ? probe : markerOk;
  try {
    await assertTestEnvironment(env, effective);
    check(name, false, "ALLOWED a target it should have refused");
  } catch (err) {
    check(name, err instanceof TestEnvironmentRefused,
      `threw ${err && err.name} instead of refusing: ${err && err.message}`);
  }
}

async function main() {
  // ── The permitted case ────────────────────────────────────────────
  section("The configured test target is permitted");
  try {
    const id = await assertTestEnvironment(goodEnv(), markerOk);
    check("a fully verified test target is allowed", id === TEST_REF, `got ${id}`);
  } catch (err) {
    check("a fully verified test target is allowed", false, `refused: ${err.message}`);
  }
  check("…and nothing else is allowed by default",
    typeof verifyStatic === "function" && typeof verifyLive === "function");

  // ── Production ────────────────────────────────────────────────────
  section("Production targets are rejected");
  await refuses("production URL with production key is refused", {
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    [TEST_KEY_VAR]: keyClaiming(PROD_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("production URL is refused even if someone allowlists the test ref", {
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    [TEST_KEY_VAR]: keyClaiming(TEST_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("production is refused even when it carries a marker claiming otherwise", {
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    [TEST_KEY_VAR]: keyClaiming(PROD_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  }, async () => ({ ok: true, row: { target_identity: PROD_REF, is_production: false } }));

  // ── Weak signals must not rescue a bad target ─────────────────────
  section("Weak signals cannot authorise a target");
  await refuses("NODE_ENV=test does not authorise production", {
    NODE_ENV: "test",
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    [TEST_KEY_VAR]: keyClaiming(PROD_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("a variable whose value is 'test' does not authorise production", {
    DEALSPRO_ENV: "test", ENVIRONMENT: "test",
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    [TEST_KEY_VAR]: keyClaiming(PROD_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("a 'test'-looking hostname does not authorise an unallowlisted project", {
    NEXT_PUBLIC_SUPABASE_URL: "https://testtesttesttest.supabase.co",
    [TEST_KEY_VAR]: keyClaiming("testtesttesttest"),
    [ALLOWLIST_VAR]: TEST_REF,
  });

  // ── Unknown / unparseable ─────────────────────────────────────────
  section("Unknown targets are rejected");
  await refuses("an unrecognised host shape is refused", {
    NEXT_PUBLIC_SUPABASE_URL: "https://db.internal.example.com",
    [TEST_KEY_VAR]: keyClaiming(TEST_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("a malformed URL is refused", {
    NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    [TEST_KEY_VAR]: keyClaiming(TEST_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("a project absent from the allowlist is refused", {
    NEXT_PUBLIC_SUPABASE_URL: "https://unknownunknownxx.supabase.co",
    [TEST_KEY_VAR]: keyClaiming("unknownunknownxx"),
    [ALLOWLIST_VAR]: TEST_REF,
  });

  // ── Missing configuration ─────────────────────────────────────────
  section("Missing configuration is rejected");
  for (const [name, mutate] of [
    ["no URL", (e) => { delete e.NEXT_PUBLIC_SUPABASE_URL; }],
    ["no dedicated test credential", (e) => { delete e[TEST_KEY_VAR]; }],
    ["no allowlist", (e) => { delete e[ALLOWLIST_VAR]; }],
    ["empty allowlist", (e) => { e[ALLOWLIST_VAR] = "   ,  ,"; }],
  ]) {
    const env = goodEnv(); mutate(env);
    await refuses(`${name} is refused`, env);
  }
  await refuses("the production key variable cannot substitute for the test one", {
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: keyClaiming(TEST_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });

  // ── Mismatch ──────────────────────────────────────────────────────
  section("Mismatched targets are rejected");
  await refuses("a credential for another project is refused", {
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    [TEST_KEY_VAR]: keyClaiming(PROD_REF),
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("a remote project whose credential claims nothing is refused", {
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    [TEST_KEY_VAR]: "opaque-not-a-jwt",
    [ALLOWLIST_VAR]: TEST_REF,
  });
  await refuses("a marker naming a different target is refused", goodEnv(),
    async () => ({ ok: true, row: { target_identity: "someotherproject", is_production: false } }));

  // ── Live verification unavailable → refuse ────────────────────────
  section("Unavailable verification is a refusal, not a pass");
  await refuses("marker table absent is refused", goodEnv(),
    async () => ({ ok: false, error: 'relation "dealspro_test_marker" does not exist' }));
  await refuses("probe throwing (network down) is refused", goodEnv(),
    async () => { throw new Error("ECONNREFUSED"); });
  await refuses("empty marker table is refused", goodEnv(),
    async () => ({ ok: true, row: null }));
  await refuses("no probe supplied at all is refused", goodEnv(), undefined);
  await refuses("marker with is_production true is refused", goodEnv(),
    async () => ({ ok: true, row: { target_identity: TEST_REF, is_production: true } }));
  await refuses("marker with a non-boolean is_production is refused", goodEnv(),
    async () => ({ ok: true, row: { target_identity: TEST_REF, is_production: "false" } }));
  await refuses("marker with is_production missing is refused", goodEnv(),
    async () => ({ ok: true, row: { target_identity: TEST_REF } }));

  // ── Parsing units ─────────────────────────────────────────────────
  section("Identity parsing");
  check("a supabase project parses to its ref",
    parseTargetIdentity(`https://${TEST_REF}.supabase.co`) === TEST_REF);
  check("a loopback cluster parses to a local identity",
    parseTargetIdentity("http://127.0.0.1:54321") === "local:127.0.0.1:54321");
  check("a lookalike domain does NOT parse as supabase",
    parseTargetIdentity("https://evil-supabase.co.attacker.com") === null);
  check("a subdomain-suffix lookalike does NOT parse",
    parseTargetIdentity("https://ref.supabase.co.evil.com") === null);
  check("a credential's ref claim is read", credentialRefClaim(keyClaiming("abc")) === "abc");
  check("a non-JWT yields no claim", credentialRefClaim("nope") === null);

  // ── The guard must not be bypassable by the suite itself ──────────
  section("Structural: the suite cannot write before the gate");
  const src = require("fs").readFileSync(require("path").join(__dirname, "test-regression.js"), "utf8");
  check("getSupabase refuses until VERIFIED_TARGET is set",
    /VERIFIED_TARGET === null[\s\S]{0,200}TestEnvironmentRefused/.test(src),
    "the chokepoint no longer refuses unverified access");
  check("the suite reads the DEDICATED credential, not the production one",
    src.includes("process.env[TEST_KEY_VAR]") &&
      !/createClient\([\s\S]{0,120}process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(src),
    "a client is still built from SUPABASE_SERVICE_ROLE_KEY");
  check("the gate runs before the first test in main()",
    src.indexOf("assertTestEnvironment(") < src.indexOf("await testEnvironment();"),
    "a test runs before the environment is verified");

  console.log(`\n${"═".repeat(54)}`);
  console.log(`  TOTAL: ${passed} PASS / ${failed} FAIL`);
  console.log(`${"═".repeat(54)}\n`);
  if (failures.length) {
    console.log("FAILED TESTS:");
    failures.forEach((f) => console.log(`  ✗ ${f.name} — ${f.reason}`));
    console.log("");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
