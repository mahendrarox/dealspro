#!/usr/bin/env node
/**
 * Intake-link DATABASE behaviour, against a throwaway PostgreSQL cluster.
 *
 * This suite never touches Supabase, never reads a production credential,
 * and never connects to anything it did not itself create. It boots a
 * fresh cluster in a temp directory, applies the real migration files
 * from this repository, asserts the behaviour the application relies on,
 * then destroys the cluster.
 *
 * What it proves that the pure suite cannot: uniqueness of the code
 * hash, revocation semantics under the partial index, FK cascade, the
 * CHECK constraints, and — most importantly — that RLS with zero
 * policies really does hide a row from `anon` and `authenticated` even
 * though Supabase's default privileges grant them full table access.
 *
 * Run: npm run test:intake:db
 * Requires: PostgreSQL server binaries (initdb, pg_ctl, psql) on PATH,
 *           or at one of the usual distribution locations. Skips with a
 *           clear message when they are absent.
 */

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const PORT = 55440 + (process.pid % 200);

let passed = 0;
let failed = 0;
const failures = [];

const pass = (n) => { passed++; console.log(`  [PASS] ${n}`); };
const fail = (n, r) => { failed++; failures.push({ n, r }); console.log(`  [FAIL] ${n} — ${r}`); };
const check = (n, cond, r = "assertion failed") => (cond ? pass(n) : fail(n, r));
const section = (t) => console.log(`\n── ${t} ──`);

// ─── Locating the server binaries ────────────────────────────────────

function findBinDir() {
  const probe = (dir) => {
    const initdb = path.join(dir, process.platform === "win32" ? "initdb.exe" : "initdb");
    return fs.existsSync(initdb) ? dir : null;
  };
  // On PATH?
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["initdb"], {
    encoding: "utf8",
  });
  if (which.status === 0 && which.stdout.trim()) {
    return path.dirname(which.stdout.trim().split(/\r?\n/)[0]);
  }
  // Common distribution layouts.
  const candidates = [];
  for (const base of ["/usr/lib/postgresql", "/usr/local/pgsql/bin", "/opt/homebrew/opt"]) {
    if (!fs.existsSync(base)) continue;
    if (base.endsWith("/bin")) { candidates.push(base); continue; }
    for (const entry of fs.readdirSync(base)) {
      candidates.push(path.join(base, entry, "bin"));
      candidates.push(path.join(base, entry, "libexec", "bin"));
    }
  }
  for (const c of candidates) { const hit = probe(c); if (hit) return hit; }
  return null;
}

const BIN = findBinDir();
if (!BIN) {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Intake link · DATABASE suite                   ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("\n  [SKIP] PostgreSQL server binaries not found (initdb/pg_ctl/psql).");
  console.log("         Install a local PostgreSQL server to run this suite.");
  console.log("         The pure suite (npm run test:intake) covers everything");
  console.log("         that does not need a database.\n");
  process.exit(0);
}

// ─── Cluster lifecycle ───────────────────────────────────────────────
//
// initdb refuses to run as root. When this script IS root (CI containers
// often are) we drop to an unprivileged account for every server call.

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
const RUNAS = IS_ROOT
  ? (spawnSync("id", ["-u", "postgres"]).status === 0 ? "postgres" : null)
  : null;

if (IS_ROOT && !RUNAS) {
  console.log("\n  [SKIP] running as root and no 'postgres' user exists to drop to.\n");
  process.exit(0);
}

const DATA = fs.mkdtempSync(path.join(IS_ROOT ? "/var/tmp" : os.tmpdir(), "dp-intake-db-"));
const CLUSTER = path.join(DATA, "data");
if (IS_ROOT) execFileSync("chown", ["-R", RUNAS, DATA]);
fs.chmodSync(DATA, 0o700);

function pg(cmd, args, opts = {}) {
  const exe = path.join(BIN, cmd);
  if (RUNAS) {
    const quoted = args.map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(" ");
    return execFileSync("su", [RUNAS, "-s", "/bin/bash", "-c", `${exe} ${quoted}`], {
      encoding: "utf8", ...opts,
    });
  }
  return execFileSync(exe, args, { encoding: "utf8", ...opts });
}

/**
 * Run SQL and return { ok, out }.
 *
 * ON_ERROR_STOP is ALWAYS set: without it psql exits 0 even when a
 * statement fails, so a test asserting "this is rejected" would see an
 * empty string and silently pass nothing. stderr is captured rather than
 * inherited so `out` carries the constraint name on the failure path and
 * NOTICE chatter stays out of the report.
 */
function sql(text) {
  const file = path.join(DATA, `q-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o644);
  try {
    const out = pg("psql", [
      "-h", DATA, "-p", String(PORT), "-U", "postgres", "-X", "-q", "-A", "-t",
      "-v", "ON_ERROR_STOP=1", "-f", file,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, out: (out ?? "").trim() };
  } catch (err) {
    const stdout = (err.stdout ?? "").toString();
    const stderr = (err.stderr ?? "").toString();
    return { ok: false, out: (stdout + stderr).trim() };
  } finally {
    try { fs.unlinkSync(file); } catch { /* ignore */ }
  }
}

/** Assert that a statement is REJECTED, and that the named guard did it. */
function rejects(text, guard) {
  const res = sql(text);
  return !res.ok && res.out.includes(guard);
}

const one = (text) => sql(text).out;

function shutdown() {
  try { pg("pg_ctl", ["-D", CLUSTER, "stop", "-m", "immediate"], { stdio: "ignore" }); } catch { /* */ }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* */ }
}
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(130); });

// ─── Boot ────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════╗");
console.log("║   Intake link · DATABASE suite (isolated)        ║");
console.log("║   Throwaway cluster — never touches Supabase     ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`\n  binaries : ${BIN}`);
console.log(`  cluster  : ${DATA} (port ${PORT}, removed on exit)`);

try {
  pg("initdb", ["-D", CLUSTER, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });
  pg("pg_ctl", ["-D", CLUSTER, "-o", `-p ${PORT} -k ${DATA} -c listen_addresses=''`,
                "-l", path.join(DATA, "pg.log"), "-w", "start"], { stdio: "ignore" });
} catch (err) {
  console.log(`\n  [SKIP] could not start a local cluster: ${err.message}\n`);
  process.exit(0);
}

// ─── Fixture: the prerequisite schema and Supabase-shaped roles ──────

section("Setup");

const fixture = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase grants everything on new public tables by default. Reproducing
-- that here is the point: RLS must hold even so.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

CREATE TABLE restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, city text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}', address text NOT NULL,
  latitude double precision NOT NULL, longitude double precision NOT NULL,
  place_id text, is_active boolean NOT NULL DEFAULT true, image_url text, slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE drop_items (
  id text PRIMARY KEY, title text NOT NULL, restaurant_name text NOT NULL, image_url text,
  price numeric(10,2) NOT NULL CHECK (price >= 0), original_price numeric(10,2),
  total_spots integer NOT NULL CHECK (total_spots >= 0),
  start_time timestamptz NOT NULL, end_time timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT false, is_hero boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0, archived_at timestamptz,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

INSERT INTO restaurants (name, city, address, latitude, longitude, slug)
VALUES ('Alpha Kitchen','Frisco','1 A St',33.1,-96.8,'alpha'),
       ('Beta Kitchen','Plano','2 B St',33.0,-96.7,'beta');
`;
check("fixture schema applied", sql(fixture).ok);

for (const m of ["migration-009-drop-submissions.sql", "migration-010-intake-links.sql"]) {
  const res = sql(fs.readFileSync(path.join(REPO, m), "utf8"));
  check(`${m} applied`, res.ok, res.out.slice(0, 300));
}

const REST_A = one("SELECT id FROM restaurants WHERE slug='alpha';");
const REST_B = one("SELECT id FROM restaurants WHERE slug='beta';");

// Hash helper mirroring lib/intake/links.ts.
const crypto = require("crypto");
const h = (code) => crypto.createHash("sha256").update(code, "utf8").digest("hex");
// 22-character base64url stand-ins, matching the real generator's shape.
const CODE_A = "AAAAAAAAAAAAAAAAAAAAAA";
const CODE_B = "BBBBBBBBBBBBBBBBBBBBBB";
const CODE_EXPIRED = "CCCCCCCCCCCCCCCCCCCCCC";
const CODE_SECOND = "DDDDDDDDDDDDDDDDDDDDDD";
const CODE_THIRD = "EEEEEEEEEEEEEEEEEEEEEE";
const mk = (restaurantId, code, over = {}) => {
  const cols = {
    restaurant_id: `'${restaurantId}'`,
    code_hash: `'${h(code)}'`,
    code_prefix: `'${code.slice(0, 6)}'`,
    expires_at: over.expires_at ?? `now() + interval '14 days'`,
    created_by: `'op@dealspro.ai'`,
    ...over,
  };
  return `INSERT INTO intake_links (${Object.keys(cols).join(",")}) VALUES (${Object.values(cols).join(",")}) RETURNING id;`;
};

// ─── Structure ───────────────────────────────────────────────────────

section("Structure");

check("intake_links exists", one("SELECT to_regclass('public.intake_links');") === "intake_links");
check("RLS enabled", one(
  "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='intake_links';",
) === "t");
check("zero RLS policies", one(
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='intake_links';",
) === "0");
check("unique index on code_hash", one(
  "SELECT count(*) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid='public.intake_links'::regclass AND ic.relname='uq_intake_links_code_hash' AND i.indisunique;",
) === "1");
check("starts empty", one("SELECT count(*) FROM intake_links;") === "0");
check("restaurant FK cascades", one(
  "SELECT confdeltype FROM pg_constraint WHERE conrelid='public.intake_links'::regclass AND contype='f' AND confrelid='public.restaurants'::regclass;",
) === "c");

// ─── Constraints ─────────────────────────────────────────────────────

section("Constraints");

check("a well-formed link inserts", sql(mk(REST_A, CODE_A)).ok);

check(
  "duplicate code_hash is rejected",
  rejects(mk(REST_B, CODE_A), "uq_intake_links_code_hash"),
);
check(
  "a short (non-sha256) code_hash is rejected",
  rejects(`INSERT INTO intake_links (restaurant_id, code_hash, code_prefix, expires_at, created_by)
           VALUES ('${REST_A}', 'tooshort', 'abcdef', now() + interval '1 day', 'op');`,
          "intake_links_code_hash_len"),
);
check(
  "revoked_at without revoked_by is rejected",
  rejects(`INSERT INTO intake_links (restaurant_id, code_hash, code_prefix, expires_at, created_by, revoked_at)
           VALUES ('${REST_A}', '${h("zzz")}', 'abcdef', now() + interval '1 day', 'op', now());`,
          "intake_links_revoke_pair"),
);

// ─── Resolution semantics ────────────────────────────────────────────

section("Resolution semantics");

sql(mk(REST_A, CODE_EXPIRED, { expires_at: `now() - interval '1 hour'` }));
sql(mk(REST_B, CODE_B));

const liveHash = h(CODE_A);
check(
  "a live code resolves to its own restaurant",
  one(`SELECT restaurant_id FROM intake_links WHERE code_hash='${liveHash}' AND revoked_at IS NULL AND expires_at > now();`) === REST_A,
);
check(
  "restaurant isolation: A's code never resolves to B",
  one(`SELECT count(*) FROM intake_links WHERE code_hash='${liveHash}' AND restaurant_id='${REST_B}';`) === "0",
);
check(
  "an expired code does not resolve",
  one(`SELECT count(*) FROM intake_links WHERE code_hash='${h(CODE_EXPIRED)}' AND expires_at > now();`) === "0",
);
check(
  "an unknown code resolves to nothing",
  one(`SELECT count(*) FROM intake_links WHERE code_hash='${h("ZZZZZZZZZZZZZZZZZZZZZZ")}';`) === "0",
);

// ─── Revocation and replacement ──────────────────────────────────────

section("Revocation and replacement");

const revokeSql = (hash) => `
UPDATE intake_links SET revoked_at = now(), revoked_by = 'op@dealspro.ai', revoke_reason = 'test'
WHERE code_hash = '${hash}' AND revoked_at IS NULL RETURNING id;`;

check("revoking a live link affects exactly one row", sql(revokeSql(liveHash)).out.split("\n").filter(Boolean).length === 1);
check(
  "a revoked code no longer resolves",
  one(`SELECT count(*) FROM intake_links WHERE code_hash='${liveHash}' AND revoked_at IS NULL;`) === "0",
);
check(
  "re-revoking is a no-op, not an error",
  sql(revokeSql(liveHash)).out.split("\n").filter(Boolean).length === 0,
);
{
  const before = one(`SELECT revoked_at FROM intake_links WHERE code_hash='${liveHash}';`);
  sql(revokeSql(liveHash));
  check(
    "re-revoking does not rewrite the original revocation timestamp",
    one(`SELECT revoked_at FROM intake_links WHERE code_hash='${liveHash}';`) === before,
  );
}

// Replace: revoke all live links for A, mint one, chain the old to the new.
sql(mk(REST_A, CODE_SECOND));
sql(`UPDATE intake_links SET revoked_at=now(), revoked_by='op', revoke_reason='replaced'
     WHERE restaurant_id='${REST_A}' AND revoked_at IS NULL;`);
const newId = one(mk(REST_A, CODE_THIRD)).split("\n")[0];
sql(`UPDATE intake_links SET replaced_by='${newId}'
     WHERE restaurant_id='${REST_A}' AND id <> '${newId}' AND revoked_at IS NOT NULL;`);

check(
  "after replace, exactly one live link remains for the restaurant",
  one(`SELECT count(*) FROM intake_links WHERE restaurant_id='${REST_A}' AND revoked_at IS NULL AND expires_at > now();`) === "1",
);
check(
  "superseded links point at their replacement",
  Number(one(`SELECT count(*) FROM intake_links WHERE replaced_by='${newId}';`)) >= 2,
);
check(
  "replacing one restaurant's links leaves another's alone",
  one(`SELECT count(*) FROM intake_links WHERE restaurant_id='${REST_B}' AND revoked_at IS NULL;`) === "1",
);

// ─── Deny-all under Supabase-style grants ────────────────────────────

section("RLS deny-all (with full default grants in place)");

check(
  "anon and authenticated DO hold table grants (Supabase default reproduced)",
  Number(one(`SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='intake_links' AND grantee IN ('anon','authenticated');`)) > 0,
);
check("owner sees the rows", Number(one("SELECT count(*) FROM intake_links;")) > 0);
check(
  "anon sees zero rows",
  one("SET ROLE anon; SELECT count(*) FROM intake_links;") === "0",
);
check(
  "authenticated sees zero rows",
  one("SET ROLE authenticated; SELECT count(*) FROM intake_links;") === "0",
);
check(
  "anon cannot insert a link",
  rejects(`SET ROLE anon;
           INSERT INTO intake_links (restaurant_id, code_hash, code_prefix, expires_at, created_by)
           VALUES ('${REST_A}', '${h("YYYYYYYYYYYYYYYYYYYYYY")}', 'anonXX', now() + interval '1 day', 'anon');`,
          "row-level security"),
);
check(
  "anon cannot un-revoke a link",
  one(`SET ROLE anon; WITH u AS (UPDATE intake_links SET revoked_at=NULL WHERE code_hash='${liveHash}' RETURNING 1) SELECT count(*) FROM u;`) === "0",
);
check(
  "service_role (BYPASSRLS) still sees them — the app path works",
  Number(one("SET ROLE service_role; SELECT count(*) FROM intake_links;")) > 0,
);
check(
  "the plaintext code is nowhere in the table",
  one(`SELECT count(*) FROM intake_links WHERE code_hash LIKE '%' || '${CODE_A}' || '%' OR code_prefix = '${CODE_A}';`) === "0",
);


// ─── Effective table privileges (RLS does NOT cover these) ───────────

section("Effective privileges beyond RLS");

for (const tbl of ["intake_links", "intake_legacy_cutoffs", "drop_submissions"]) {
  for (const role of ["anon", "authenticated"]) {
    for (const priv of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
      check(
        `${role} has NO ${priv} on ${tbl}`,
        one(`SELECT has_table_privilege('${role}', 'public.${tbl}', '${priv}');`) === "f",
      );
    }
  }
}

// The privilege bit is the claim; this is the behaviour. TRUNCATE ignores
// RLS entirely, so without the REVOKE a browser role could have emptied
// these tables outright.
check(
  "anon cannot TRUNCATE intake_links (the hole RLS does not cover)",
  rejects(`SET ROLE anon; TRUNCATE TABLE intake_links;`, "permission denied"),
);
check(
  "anon cannot TRUNCATE drop_submissions",
  rejects(`SET ROLE anon; TRUNCATE TABLE drop_submissions;`, "permission denied"),
);
check(
  "authenticated cannot TRUNCATE intake_links",
  rejects(`SET ROLE authenticated; TRUNCATE TABLE intake_links;`, "permission denied"),
);
check(
  "rows survived every TRUNCATE attempt",
  Number(one("SELECT count(*) FROM intake_links;")) > 0,
);
check(
  "service_role retains TRUNCATE (the server is unaffected)",
  one(`SELECT has_table_privilege('service_role', 'public.intake_links', 'TRUNCATE');`) === "t",
);

// ─── Legacy JWT cutoff ───────────────────────────────────────────────

section("Legacy JWT cutoff table");

check("intake_legacy_cutoffs exists",
  one("SELECT to_regclass('public.intake_legacy_cutoffs');") === "intake_legacy_cutoffs");
check("RLS enabled on the cutoff table", one(
  "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='intake_legacy_cutoffs';",
) === "t");
check("zero policies on the cutoff table", one(
  "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='intake_legacy_cutoffs';",
) === "0");

check("a cutoff can be set", sql(
  `INSERT INTO intake_legacy_cutoffs (restaurant_id, cutoff_at, set_by)
   VALUES ('${REST_A}', now(), 'op@dealspro.ai');`).ok);
check("one cutoff per restaurant (PK enforced)", rejects(
  `INSERT INTO intake_legacy_cutoffs (restaurant_id, cutoff_at, set_by)
   VALUES ('${REST_A}', now(), 'op2');`, "duplicate key"));
check("re-setting a cutoff upserts rather than duplicating", sql(
  `INSERT INTO intake_legacy_cutoffs (restaurant_id, cutoff_at, set_by)
   VALUES ('${REST_A}', now(), 'op3')
   ON CONFLICT (restaurant_id) DO UPDATE SET cutoff_at = EXCLUDED.cutoff_at, set_by = EXCLUDED.set_by;`).ok
  && one(`SELECT count(*) FROM intake_legacy_cutoffs WHERE restaurant_id='${REST_A}';`) === "1");
check("a cutoff for A does not exist for B",
  one(`SELECT count(*) FROM intake_legacy_cutoffs WHERE restaurant_id='${REST_B}';`) === "0");
check("anon sees no cutoffs",
  one("SET ROLE anon; SELECT count(*) FROM intake_legacy_cutoffs;") === "0");

// ─── Cascade ─────────────────────────────────────────────────────────

section("Cascade");

{
  const before = Number(one(`SELECT count(*) FROM intake_links WHERE restaurant_id='${REST_B}';`));
  sql(`DELETE FROM restaurants WHERE id='${REST_B}';`);
  check("deleting a restaurant removes its links", before > 0 &&
    one(`SELECT count(*) FROM intake_links WHERE restaurant_id='${REST_B}';`) === "0");
  check("other restaurants' links survive",
    Number(one(`SELECT count(*) FROM intake_links WHERE restaurant_id='${REST_A}';`)) > 0);
  check("deleting a restaurant also clears its legacy cutoff",
    one(`SELECT count(*) FROM intake_legacy_cutoffs WHERE restaurant_id='${REST_B}';`) === "0");
}

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(54)}`);
console.log(`  TOTAL: ${passed} PASS / ${failed} FAIL`);
console.log(`${"═".repeat(54)}\n`);
if (failures.length) {
  console.log("FAILED TESTS:");
  failures.forEach((f) => console.log(`  ✗ ${f.n} — ${f.r}`));
  console.log("");
}
process.exit(failed > 0 ? 1 : 0);
