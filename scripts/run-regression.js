#!/usr/bin/env node
/**
 * Regression test runner — starts the dev server, waits for it,
 * runs test-regression.js, then tears everything down.
 *
 * Usage:  node scripts/run-regression.js
 *         npm run test:regression
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const MAX_WAIT_MS = 90_000; // 90 seconds for dev server cold start
const POLL_INTERVAL_MS = 1_000;

// ── Helpers ───────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[runner] ${msg}`);
}

/** Check whether something is already listening on PORT */
function isPortOpen() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Poll until the server responds or timeout */
async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    if (await isPortOpen()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

/** Kill a process tree (works on Windows and Unix) */
function killTree(proc) {
  try {
    if (process.platform === "win32") {
      // /T = tree, /F = force
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-proc.pid, "SIGTERM");
    }
  } catch {
    // Already dead — that's fine
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  // 1. Check if a server is already running
  const alreadyRunning = await isPortOpen();
  let serverProc = null;

  if (alreadyRunning) {
    log(`Server already listening on port ${PORT} — reusing it`);
  } else {
    // 2. Start dev server
    log("Starting dev server (npm run dev)...");
    const isWindows = process.platform === "win32";
    if (isWindows) {
      serverProc = spawn("cmd.exe", ["/c", "npm run dev"], {
        cwd: path.resolve(__dirname, ".."),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PORT: String(PORT) },
      });
    } else {
      serverProc = spawn("npm", ["run", "dev"], {
        cwd: path.resolve(__dirname, ".."),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
        env: { ...process.env, PORT: String(PORT) },
      });
    }

    // Swallow server output (don't pollute test output)
    // but capture any early crash
    let serverStderr = "";
    serverProc.stderr.on("data", (d) => { serverStderr += d.toString(); });
    serverProc.stdout.on("data", () => {}); // drain

    serverProc.on("exit", (code) => {
      if (code && code !== 0 && !serverProc._killed) {
        console.error(`[runner] Dev server exited with code ${code}`);
        if (serverStderr) console.error(serverStderr.slice(0, 500));
      }
    });

    // 3. Wait for server to be ready
    log(`Waiting for server on port ${PORT}...`);
    const ready = await waitForServer();
    if (!ready) {
      console.error(`[runner] Server did not start within ${MAX_WAIT_MS / 1000}s`);
      if (serverStderr) console.error(serverStderr.slice(0, 1000));
      killTree(serverProc);
      process.exit(1);
    }
    log("Server is ready!");
  }

  // 4. Run the actual test suite
  let testExitCode = 1;
  try {
    const testProc = spawn("node", [path.resolve(__dirname, "test-regression.js")], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      env: { ...process.env, TEST_BASE_URL: BASE_URL },
    });

    testExitCode = await new Promise((resolve) => {
      testProc.on("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    // 5. Tear down server if we started it
    if (serverProc) {
      log("Stopping dev server...");
      serverProc._killed = true;
      killTree(serverProc);
      // Give it a moment to release the port
      await new Promise((r) => setTimeout(r, 1000));
      log("Done.");
    }
  }

  process.exit(testExitCode);
}

main().catch((err) => {
  console.error("[runner] Fatal:", err);
  process.exit(1);
});
