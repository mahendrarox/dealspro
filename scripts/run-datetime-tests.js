#!/usr/bin/env node
/**
 * Runs scripts/test-datetime.js under BOTH host timezones.
 *
 * UTC runs first and is the default, because that is the Vercel runtime
 * where the render bug actually surfaced: a developer machine set to
 * America/Chicago would have shown the correct times and hidden the
 * regression entirely. America/Chicago runs second to prove the fix is
 * genuinely timezone-independent rather than merely UTC-tuned.
 *
 * TZ is injected into the child process environment rather than via a
 * `TZ=... node` shell prefix, so this works identically on Windows
 * (cmd.exe), PowerShell and POSIX shells.
 *
 * Run: npm run test:datetime
 */

const { spawn } = require("child_process");
const path = require("path");

const SUITE = path.resolve(__dirname, "test-datetime.js");
const ZONES = ["UTC", "America/Chicago"];

function runUnder(tz) {
  return new Promise((resolve) => {
    console.log(`\n${"━".repeat(54)}`);
    console.log(`  RUN: TZ=${tz} node scripts/test-datetime.js`);
    console.log(`${"━".repeat(54)}`);
    const child = spawn(process.execPath, [SUITE], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      env: { ...process.env, TZ: tz },
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

(async () => {
  const results = [];
  for (const tz of ZONES) {
    results.push({ tz, code: await runUnder(tz) });
  }

  console.log(`\n${"═".repeat(54)}`);
  console.log("  HOST-TIMEZONE SUMMARY");
  console.log(`${"═".repeat(54)}`);
  for (const r of results) {
    console.log(`  TZ=${r.tz.padEnd(16)} ${r.code === 0 ? "PASS" : "FAIL"}`);
  }

  const anyFailed = results.some((r) => r.code !== 0);
  if (anyFailed) {
    console.log("\nFocused suite FAILED under at least one host timezone.");
    process.exit(1);
  }
  console.log("\nFocused suite passed under every host timezone ✓");
  process.exit(0);
})();
