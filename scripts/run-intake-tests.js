#!/usr/bin/env node
/**
 * Runs scripts/test-intake.js under BOTH host timezones.
 *
 * Same reasoning as run-datetime-tests.js: the intake flow converts
 * America/Chicago wall clock to UTC instants, and a developer machine
 * already set to America/Chicago would hide a host-timezone dependency
 * that then breaks on Vercel (UTC). Running both proves the conversion
 * is genuinely pinned rather than accidentally correct.
 *
 * TZ is injected into the child process environment rather than via a
 * `TZ=... node` shell prefix, so this works identically on Windows
 * (cmd.exe), PowerShell and POSIX shells — see CLAUDE.md.
 *
 * Run: npm run test:intake
 */

const { spawn } = require("child_process");
const path = require("path");

const SUITE = path.resolve(__dirname, "test-intake.js");
const ZONES = ["UTC", "America/Chicago"];

function runUnder(tz) {
  return new Promise((resolve) => {
    console.log(`\n${"━".repeat(54)}`);
    console.log(`  RUN: TZ=${tz} node scripts/test-intake.js`);
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
  console.log("  HOST-TIMEZONE SUMMARY (intake)");
  console.log(`${"═".repeat(54)}`);
  for (const r of results) {
    console.log(`  TZ=${r.tz.padEnd(16)} ${r.code === 0 ? "PASS" : "FAIL"}`);
  }
  console.log("");

  process.exit(results.every((r) => r.code === 0) ? 0 : 1);
})();
