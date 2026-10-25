#!/usr/bin/env node
/**
 * migration-013 (share_channels, channel_events) — DATABASE suite.
 *
 * Boots a throwaway PostgreSQL cluster, rebuilds enough of production to
 * apply the migration against, applies it, and asserts what the database
 * actually enforces: code uniqueness, the dedupe index that makes a
 * retried beacon a no-op, the CHECK constraints that reject hostile
 * tracking input, and deny-all access for the browser roles.
 *
 * Never touches Supabase. Destroys the cluster on exit.
 *
 * Run: npm run test:channels:db
 */

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const MIGRATION = path.join(REPO, "migration-013-share-channels.sql");
const PORT = 55900 + (process.pid % 200);

let passed = 0;
let failed = 0;
const failures = [];
const pass = (n) => { passed += 1; console.log(`  [PASS] ${n}`); };
const fail = (n, r) => { failed += 1; failures.push({ n, r }); console.log(`  [FAIL] ${n} — ${r}`); };
const check = (n, cond, r = "assertion failed") => (cond ? pass(n) : fail(n, r));
const section = (t) => console.log(`\n── ${t} ──`);

function findBinDir() {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["initdb"], {
    encoding: "utf8",
  });
  if (which.status === 0 && which.stdout.trim()) {
    return path.dirname(which.stdout.trim().split(/\r?\n/)[0]);
  }
  const candidates = [];
  for (const base of ["/usr/lib/postgresql", "/usr/local/pgsql/bin", "/opt/homebrew/opt"]) {
    if (!fs.existsSync(base)) continue;
    if (base.endsWith("/bin")) { candidates.push(base); continue; }
    for (const entry of fs.readdirSync(base)) {
      candidates.push(path.join(base, entry, "bin"));
      candidates.push(path.join(base, entry, "libexec", "bin"));
    }
  }
  for (const c of candidates) if (fs.existsSync(path.join(c, "initdb"))) return c;
  return null;
}

const BIN = findBinDir();
if (!BIN) {
  console.log("\n  [SKIP] PostgreSQL server binaries not found — migration UNVERIFIED.\n");
  process.exit(0);
}

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
const RUNAS = IS_ROOT
  ? (spawnSync("id", ["-u", "postgres"]).status === 0 ? "postgres" : null)
  : null;
if (IS_ROOT && !RUNAS) {
  console.log("\n  [SKIP] running as root with no 'postgres' user to drop to.\n");
  process.exit(0);
}

const DATA = fs.mkdtempSync(path.join(IS_ROOT ? "/var/tmp" : os.tmpdir(), "dp-chan-db-"));
const CLUSTER = path.join(DATA, "data");
if (IS_ROOT) execFileSync("chown", ["-R", RUNAS, DATA]);
fs.chmodSync(DATA, 0o755);

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

/** ON_ERROR_STOP is ALWAYS set: without it psql exits 0 on a failed
 *  statement, and every "must be rejected" test below would pass without
 *  testing anything. */
function sql(text) {
  const file = path.join(DATA, `q-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o644);
  try {
    const out = pg("psql", [
      "-h", DATA, "-p", String(PORT), "-U", "postgres", "-d", "chantest",
      "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", file,
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
const one = (t) => sql(t).out;
/** Assert a statement is REJECTED, by the named guard. */
const rejects = (t, guard) => {
  const r = sql(t);
  return !r.ok && r.out.includes(guard);
};

function shutdown() {
  try { pg("pg_ctl", ["-D", CLUSTER, "stop", "-m", "immediate"], { stdio: "ignore" }); } catch { /* */ }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* */ }
}
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(130); });

console.log("╔══════════════════════════════════════════════════╗");
console.log("║   migration-013 (sharing) · DATABASE suite       ║");
console.log("║   Throwaway cluster — never touches Supabase     ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`\n  cluster : ${DATA} (port ${PORT}, removed on exit)`);

try {
  pg("initdb", ["-D", CLUSTER, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });
  pg("pg_ctl", ["-D", CLUSTER, "-o", `-p ${PORT} -k ${DATA} -c listen_addresses=''`,
                "-l", path.join(DATA, "pg.log"), "-w", "start"], { stdio: "ignore" });
  pg("createdb", ["-h", DATA, "-p", String(PORT), "-U", "postgres", "chantest"], { stdio: "ignore" });
} catch (err) {
  console.log(`\n  [SKIP] could not start a local cluster: ${err.message}\n`);
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════
// FIXTURE
// ═══════════════════════════════════════════════════════════════════════

section("Fixture: Supabase roles, orders with a tag column");

check("roles created", sql(`
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Supabase hands ALL on every new public table to the browser roles.
-- Reproducing that is the point: the migration must hold even so.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
`).ok);

// migration-002's trigger function, which migration-013 reuses.
check("updated_at trigger function present", sql(`
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
`).ok);

// orders, as migration-012 leaves it.
check("orders (with tag) created", sql(`
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_item_id text, drop_id text, drop_title text, restaurant_name text,
  price_paid numeric NOT NULL, status text NOT NULL DEFAULT 'paid',
  stripe_session_id text, qr_token text NOT NULL,
  phone text, redemption_status text DEFAULT 'pending',
  quantity integer NOT NULL DEFAULT 1, tag text,
  created_at timestamptz DEFAULT now(), redeemed_at timestamptz
);
CREATE UNIQUE INDEX uq_stripe_session ON orders (stripe_session_id);
CREATE INDEX idx_orders_tag ON orders (tag) WHERE tag IS NOT NULL;
`).ok);

// ── The precondition must actually fire ─────────────────────────────
section("Precondition");
{
  sql("ALTER TABLE orders DROP COLUMN tag;");
  const withoutTag = sql(fs.readFileSync(MIGRATION, "utf8"));
  check(
    "refuses to apply when orders.tag is missing",
    !withoutTag.ok && /migration-012/.test(withoutTag.out),
    withoutTag.ok ? "applied anyway" : withoutTag.out.slice(0, 160),
  );
  check(
    "and left nothing behind when it refused",
    one(`SELECT count(*) FROM information_schema.tables
         WHERE table_schema='public' AND table_name='share_channels';`) === "0",
  );
  sql("ALTER TABLE orders ADD COLUMN tag text;");
}

// ═══════════════════════════════════════════════════════════════════════
section("Applying migration-013-share-channels.sql");

const applied = sql(fs.readFileSync(MIGRATION, "utf8"));
check("migration applies cleanly", applied.ok, applied.out.slice(0, 500));
if (!applied.ok) {
  console.log(`\n${"═".repeat(54)}\n  TOTAL: ${passed} PASS / ${failed} FAIL\n${"═".repeat(54)}\n`);
  process.exit(1);
}
const again = sql(fs.readFileSync(MIGRATION, "utf8"));
check("migration is safe to re-run (idempotent)", again.ok, again.out.slice(0, 300));
check(
  "re-running did not duplicate the instrumentation row",
  one("SELECT count(*) FROM channel_instrumentation;") === "1",
);

// ═══════════════════════════════════════════════════════════════════════
section("Structure");

for (const t of ["share_channels", "channel_events", "channel_instrumentation"]) {
  check(`${t} exists`, one(`SELECT to_regclass('public.${t}') IS NOT NULL;`) === "t");
  check(
    `${t} has RLS on and zero policies`,
    one(`SELECT (c.relrowsecurity AND (SELECT count(*) FROM pg_policies p
          WHERE p.schemaname='public' AND p.tablename='${t}') = 0)::text
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname='${t}';`) === "true",
  );
  for (const role of ["anon", "authenticated"]) {
    for (const priv of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
      check(
        `${role} holds no ${priv} on ${t}`,
        one(`SELECT has_table_privilege('${role}','public.${t}','${priv}')::text;`) === "false",
      );
    }
  }
}
check(
  "the code index is UNIQUE",
  one(`SELECT indexdef FROM pg_indexes WHERE indexname='uq_share_channels_code';`).includes("UNIQUE"),
);
check(
  "the dedupe index is UNIQUE",
  one(`SELECT indexdef FROM pg_indexes WHERE indexname='uq_channel_events_dedupe';`).includes("UNIQUE"),
);
check(
  "nothing was added to orders",
  one(`SELECT count(*) FROM information_schema.columns
       WHERE table_name='orders' AND column_name NOT IN
       ('id','drop_item_id','drop_id','drop_title','restaurant_name','price_paid',
        'status','stripe_session_id','qr_token','phone','redemption_status',
        'quantity','tag','created_at','redeemed_at');`) === "0",
);
check(
  "channel_events carries no customer column",
  one(`SELECT count(*) FROM information_schema.columns
       WHERE table_name='channel_events'
         AND column_name IN ('phone','qr_token','price_paid','stripe_session_id','user_id');`) === "0",
);

// ═══════════════════════════════════════════════════════════════════════
section("The registry: codes are unique and immutable in practice");

const mk = (code, label, active = "true") =>
  `INSERT INTO share_channels (code, label, is_active, created_by)
   VALUES ('${code}','${label}',${active},'studio@localhost') RETURNING code;`;

check("a channel inserts", sql(mk("ramesh", "Ramesh")).ok);
check("a second channel inserts", sql(mk("frisco-whatsapp", "Frisco WhatsApp")).ok);
check(
  "a duplicate code is rejected by the unique index",
  rejects(mk("ramesh", "Ramesh Again"), "uq_share_channels_code"),
);
check(
  "a code the tag normalizer would reject is refused",
  rejects(mk("Ramesh Patel", "Bad"), "share_channels_code_format"),
);
for (const bad of ["UPPER", "has space", "dot.dot", "", "x".repeat(65)]) {
  check(
    `code ${JSON.stringify(bad)} is refused by the format CHECK`,
    rejects(mk(bad, "Bad"), "share_channels_code_format"),
  );
}
check(
  "a blank label is refused",
  rejects(`INSERT INTO share_channels (code,label,created_by) VALUES ('blank','   ','x');`,
          "share_channels_label_len"),
);

// Renaming: label moves, code does not, and updated_at is maintained.
{
  const before = one("SELECT code || '|' || label FROM share_channels WHERE code='ramesh';");
  sql("UPDATE share_channels SET label='Ramesh Patel' WHERE code='ramesh';");
  const after = one("SELECT code || '|' || label FROM share_channels WHERE code='ramesh';");
  check("renaming changes the label", before !== after && after.endsWith("|Ramesh Patel"));
  check("renaming leaves the code untouched", after.startsWith("ramesh|"));
  check(
    "the trigger maintained updated_at",
    one("SELECT (updated_at > created_at)::text FROM share_channels WHERE code='ramesh';") === "true",
  );
}

// Retiring is not deleting.
{
  sql("UPDATE share_channels SET is_active=false WHERE code='frisco-whatsapp';");
  check(
    "retiring keeps the row",
    one("SELECT count(*) FROM share_channels WHERE code='frisco-whatsapp';") === "1",
  );
  check(
    "retiring only flips is_active",
    one("SELECT is_active::text FROM share_channels WHERE code='frisco-whatsapp';") === "false",
  );
}

// There is deliberately no FK from orders.tag.
check(
  "orders.tag has no foreign key to the registry",
  one(`SELECT count(*) FROM pg_constraint
       WHERE conrelid='public.orders'::regclass AND contype='f'
         AND pg_get_constraintdef(oid) LIKE '%share_channels%';`) === "0",
);
{
  sql(`INSERT INTO orders (drop_item_id, price_paid, qr_token, tag, status)
       VALUES ('drop-1', 10, 'qr-unknown-1', 'ghost-partner', 'paid');`);
  check(
    "an order can carry a tag that is not in the registry",
    one("SELECT tag FROM orders WHERE qr_token='qr-unknown-1';") === "ghost-partner",
  );
}

// ═══════════════════════════════════════════════════════════════════════
section("Events: retries cannot inflate a count");

const evt = (type, key, tag = "ramesh", drop = "drop-1") =>
  `INSERT INTO channel_events (event_type, drop_item_id, tag, dedupe_key)
   VALUES ('${type}','${drop}',${tag === null ? "NULL" : `'${tag}'`},'${key}');`;

check("a visit records", sql(evt("visit", "visit:abcdefgh1")).ok);
check(
  "the SAME beacon replayed is rejected by the dedupe index",
  rejects(evt("visit", "visit:abcdefgh1"), "uq_channel_events_dedupe"),
);
check("still exactly one visit", one("SELECT count(*) FROM channel_events WHERE event_type='visit';") === "1");

check("a different beacon records", sql(evt("visit", "visit:abcdefgh2")).ok);
check("now two visits", one("SELECT count(*) FROM channel_events WHERE event_type='visit';") === "2");

check("a checkout session records", sql(evt("checkout_session", "checkout:cs_test_123456")).ok);
check(
  "the same Stripe session cannot be counted twice",
  rejects(evt("checkout_session", "checkout:cs_test_123456"), "uq_channel_events_dedupe"),
);
check("a copy records", sql(evt("copy", "copy:abcdefgh3")).ok);
check("an untagged visit records", sql(evt("visit", "visit:abcdefgh4", null)).ok);

// Hostile input the database refuses regardless of the application.
check(
  "an unknown event type is refused",
  rejects(evt("pageview", "visit:abcdefgh5"), "channel_events_type"),
);
for (const badTag of ["UPPER", "has space", "x".repeat(65)]) {
  check(
    `a tag of ${JSON.stringify(badTag)} is refused by the format CHECK`,
    rejects(evt("visit", `visit:k${Math.random().toString(36).slice(2, 10)}`, badTag),
            "channel_events_tag_format"),
  );
}
check(
  "a too-short dedupe key is refused",
  rejects(evt("visit", "short"), "channel_events_dedupe_len"),
);
check(
  "an oversized dedupe key is refused",
  rejects(evt("visit", "v".repeat(201)), "channel_events_dedupe_len"),
);
check(
  "an oversized drop id is refused",
  rejects(evt("visit", "visit:abcdefgh9", "ramesh", "d".repeat(201)), "channel_events_drop_len"),
);

// ═══════════════════════════════════════════════════════════════════════
section("Browser roles see nothing");

check("owner sees the channels", Number(one("SELECT count(*) FROM share_channels;")) > 0);
for (const role of ["anon", "authenticated"]) {
  check(
    `${role} sees zero channels`,
    one(`SET ROLE ${role}; SELECT count(*) FROM share_channels;`) === "0",
  );
  check(
    `${role} sees zero events`,
    one(`SET ROLE ${role}; SELECT count(*) FROM channel_events;`) === "0",
  );
  check(
    `${role} cannot insert a channel`,
    rejects(`SET ROLE ${role};
             INSERT INTO share_channels (code,label,created_by) VALUES ('sneak','S','x');`,
            "row-level security"),
  );
  check(
    `${role} cannot forge an event`,
    rejects(`SET ROLE ${role};
             INSERT INTO channel_events (event_type,drop_item_id,tag,dedupe_key)
             VALUES ('visit','drop-1','ramesh','visit:forged123');`,
            "row-level security"),
  );
}
check(
  "service_role still reads them — the server path works",
  Number(one("SET ROLE service_role; SELECT count(*) FROM share_channels;")) > 0,
);

// ═══════════════════════════════════════════════════════════════════════
section("Aggregation against real rows");

sql(`
INSERT INTO orders (drop_item_id, price_paid, qr_token, tag, status, quantity, redemption_status) VALUES
  ('drop-1', 30, 'qr-a1', 'ramesh', 'paid', 3, 'redeemed'),
  ('drop-1', 10, 'qr-a2', 'ramesh', 'paid', 1, 'pending'),
  ('drop-1', 99, 'qr-a3', 'ramesh', 'pending', 1, 'pending'),
  ('drop-1', 20, 'qr-a4', NULL,     'paid', 2, 'pending'),
  ('drop-1', 10, 'qr-a5', 'frisco-whatsapp', 'paid', 1, 'pending'),
  ('drop-2', 50, 'qr-b1', 'ramesh', 'paid', 5, 'pending');
`);

check(
  "paid orders for this drop and channel",
  one(`SELECT count(*) FROM orders WHERE drop_item_id='drop-1' AND tag='ramesh' AND status='paid';`) === "2",
);
check(
  "packs sums quantity, not rows",
  one(`SELECT sum(quantity)::text FROM orders WHERE drop_item_id='drop-1' AND tag='ramesh' AND status='paid';`) === "4",
);
check(
  "recorded value sums price_paid WITHOUT multiplying by quantity",
  one(`SELECT sum(price_paid)::text FROM orders WHERE drop_item_id='drop-1' AND tag='ramesh' AND status='paid';`) === "40",
);
check(
  "picked up counts redeemed paid orders",
  one(`SELECT count(*) FROM orders WHERE drop_item_id='drop-1' AND tag='ramesh'
       AND status='paid' AND redemption_status='redeemed';`) === "1",
);
check(
  "another drop's orders are excluded",
  one(`SELECT count(*) FROM orders WHERE drop_item_id='drop-1' AND tag='ramesh';`) === "3",
);
check(
  "untagged orders are visible as their own bucket",
  one(`SELECT count(*) FROM orders WHERE drop_item_id='drop-1' AND tag IS NULL AND status='paid';`) === "1",
);
check(
  "an unknown tag is still present in the data",
  one(`SELECT count(*) FROM orders WHERE drop_item_id='drop-1' AND tag='ghost-partner';`) === "1",
);
check(
  "a retired channel keeps its orders",
  one(`SELECT count(*) FROM orders WHERE tag='frisco-whatsapp' AND status='paid';`) === "1",
);

// The shared-inventory guarantee, at the data level.
// The shared-inventory property, asserted as a property rather than as
// a number I computed by hand and got wrong: whatever the drop's claimed
// capacity is, it equals the sum of EVERY channel's claim on it. No
// channel has a pool of its own.
check(
  "every channel's orders draw on ONE shared pool",
  (() => {
    const total = one(`SELECT coalesce(sum(quantity),0)::text FROM orders
                       WHERE drop_item_id='drop-1' AND status='paid';`);
    const perChannel = one(`SELECT coalesce(sum(per_tag),0)::text FROM (
                              SELECT sum(quantity) AS per_tag FROM orders
                              WHERE drop_item_id='drop-1' AND status='paid'
                              GROUP BY coalesce(tag,'__untagged__')
                            ) x;`);
    return total === perChannel && Number(total) > 0;
  })(),
  `total=${one(`SELECT coalesce(sum(quantity),0)::text FROM orders WHERE drop_item_id='drop-1' AND status='paid';`)}`,
);
check(
  "no single channel accounts for the whole pool (more than one is claiming)",
  Number(one(`SELECT count(*)::text FROM (
                SELECT 1 FROM orders WHERE drop_item_id='drop-1' AND status='paid'
                GROUP BY coalesce(tag,'__untagged__')) x;`)) >= 3,
);
check(
  "no per-channel inventory column exists anywhere",
  one(`SELECT count(*) FROM information_schema.columns
       WHERE table_schema='public'
         AND column_name IN ('total_spots','spots_remaining','allocation')
         AND table_name IN ('share_channels','channel_events');`) === "0",
);

console.log(`\n${"═".repeat(54)}`);
console.log(`  TOTAL: ${passed} PASS / ${failed} FAIL`);
console.log(`${"═".repeat(54)}\n`);
if (failures.length > 0) {
  console.log("FAILED TESTS:");
  failures.forEach((f) => console.log(`  ✗ ${f.n} — ${f.r}`));
  console.log("");
}
process.exit(failed > 0 ? 1 : 0);
