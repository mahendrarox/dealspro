#!/usr/bin/env node
/**
 * migration-012 (orders.tag) — DATABASE suite, throwaway cluster.
 *
 * Boots a fresh PostgreSQL cluster, rebuilds the parts of production this
 * migration touches FROM THE CAPTURE — orders and drop_items with their
 * real columns, constraints and indexes, and create_order_atomic with its
 * real body — applies migration-012-order-tag.sql, and then asserts what
 * actually happens.
 *
 * It never connects to Supabase, never reads a production credential, and
 * destroys the cluster on exit.
 *
 * What it proves that no amount of reading can:
 *   * the 9-argument call every deployed caller uses still resolves;
 *   * the 10-argument call writes the tag;
 *   * a sequential retry returns 'duplicate' and cannot change a stored tag;
 *   * a CONCURRENT duplicate produces one order and one unique violation;
 *   * the oversell path is unchanged;
 *   * owner, SECURITY INVOKER, overload count and the full ACL survive the
 *     DROP and CREATE.
 *
 * Run: npm run test:tag:db
 */

const { execFileSync, spawnSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const MIGRATION = path.join(REPO, "migration-012-order-tag.sql");
const PORT = 55700 + (process.pid % 200);

let passed = 0;
let failed = 0;
const failures = [];
const pass = (n) => { passed += 1; console.log(`  [PASS] ${n}`); };
const fail = (n, r) => { failed += 1; failures.push({ n, r }); console.log(`  [FAIL] ${n} — ${r}`); };
const check = (n, cond, r = "assertion failed") => (cond ? pass(n) : fail(n, r));
const section = (t) => console.log(`\n── ${t} ──`);

// ─── Locating the server binaries ────────────────────────────────────

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
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "initdb"))) return c;
  }
  return null;
}

const BIN = findBinDir();
if (!BIN) {
  console.log("\n  [SKIP] PostgreSQL server binaries not found — cannot verify the migration.\n");
  console.log("         The migration must then be reported UNTESTED, not 'ready'.\n");
  process.exit(0);
}

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;
const RUNAS = IS_ROOT
  ? (spawnSync("id", ["-u", "postgres"]).status === 0 ? "postgres" : null)
  : null;
if (IS_ROOT && !RUNAS) {
  console.log("\n  [SKIP] running as root and no 'postgres' user exists to drop to.\n");
  process.exit(0);
}

const DATA = fs.mkdtempSync(path.join(IS_ROOT ? "/var/tmp" : os.tmpdir(), "dp-tag-db-"));
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

/**
 * Run SQL and return { ok, out }.
 *
 * ON_ERROR_STOP is ALWAYS set. Without it psql exits 0 even when a
 * statement fails, which would make every "this must be rejected"
 * assertion in this file pass without testing anything.
 */
function sql(text) {
  const file = path.join(DATA, `q-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o644);
  try {
    const out = pg("psql", [
      "-h", DATA, "-p", String(PORT), "-U", "postgres", "-d", "tagtest",
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

const one = (text) => sql(text).out;

/** Fire SQL on its OWN connection, asynchronously. Used for the race. */
function sqlAsync(text, label) {
  const file = path.join(DATA, `async-${label}.sql`);
  fs.writeFileSync(file, text);
  fs.chmodSync(file, 0o644);
  const exe = path.join(BIN, "psql");
  const args = [
    "-h", DATA, "-p", String(PORT), "-U", "postgres", "-d", "tagtest",
    "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", file,
  ];
  const child = RUNAS
    ? spawn("su", [RUNAS, "-s", "/bin/bash", "-c",
        `${exe} ${args.map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(" ")}`],
        { stdio: ["ignore", "pipe", "pipe"] })
    : spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });

  let stdout = "", stderr = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve({ code, out: stdout.trim(), err: stderr.trim() }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shutdown() {
  try { pg("pg_ctl", ["-D", CLUSTER, "stop", "-m", "immediate"], { stdio: "ignore" }); } catch { /* */ }
  try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* */ }
}
process.on("exit", shutdown);
process.on("SIGINT", () => { shutdown(); process.exit(130); });

// ─── Boot ────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════╗");
console.log("║   migration-012 (orders.tag) · DATABASE suite    ║");
console.log("║   Throwaway cluster — never touches Supabase     ║");
console.log("╚══════════════════════════════════════════════════╝");
console.log(`\n  binaries : ${BIN}`);
console.log(`  cluster  : ${DATA} (port ${PORT}, removed on exit)`);

try {
  pg("initdb", ["-D", CLUSTER, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });
  pg("pg_ctl", ["-D", CLUSTER, "-o", `-p ${PORT} -k ${DATA} -c listen_addresses=''`,
                "-l", path.join(DATA, "pg.log"), "-w", "start"], { stdio: "ignore" });
  pg("createdb", ["-h", DATA, "-p", String(PORT), "-U", "postgres", "tagtest"], { stdio: "ignore" });
} catch (err) {
  console.log(`\n  [SKIP] could not start a local cluster: ${err.message}\n`);
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════
// FIXTURE — production's shape, from the capture
// ═══════════════════════════════════════════════════════════════════════

section("Fixture: roles, tables, constraints and indexes per capture");

// Supabase's role layout. supabase_admin and authenticator appear because
// the captured privilege matrix covers them.
const roles = `
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'tagtest';
CREATE ROLE supabase_admin SUPERUSER NOLOGIN;
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`;
check("roles created", sql(roles).ok);

// users exists only because orders.user_id references it.
// drop_items is reproduced in full because the migration's preconditions
// and the oversell path both read orders against it.
const schema = `
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE, name text, consent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text
);

-- drop_items: columns in captured position order.
CREATE TABLE drop_items (
  id              text NOT NULL,
  title           text,
  restaurant_name text,
  price           numeric,
  original_price  numeric,
  total_spots     integer,
  created_at      timestamp DEFAULT now(),
  image_url       text,
  start_time      timestamptz NOT NULL,
  end_time        timestamptz NOT NULL,
  is_active       boolean NOT NULL DEFAULT false,
  is_hero         boolean NOT NULL DEFAULT false,
  priority        integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  address         text,
  latitude        double precision,
  longitude       double precision,
  place_id        text,
  restaurant_id   uuid,
  archived_at     timestamptz,
  CONSTRAINT drop_items_pkey PRIMARY KEY (id),
  CONSTRAINT drop_items_restaurant_id_fkey FOREIGN KEY (restaurant_id)
    REFERENCES restaurants(id) ON DELETE SET NULL
);

CREATE INDEX idx_drop_items_lat_lng      ON drop_items (latitude, longitude);
CREATE INDEX idx_drop_items_not_archived ON drop_items (archived_at) WHERE archived_at IS NULL;
CREATE INDEX idx_drop_items_place_id     ON drop_items (place_id);
CREATE INDEX idx_drop_items_restaurant_id ON drop_items (restaurant_id);
CREATE UNIQUE INDEX idx_single_hero      ON drop_items ((true)) WHERE is_hero = true;

-- orders: columns in captured position order. NOTE there is no tag column
-- here — adding it is the migration's job, and starting with it would
-- make this suite unable to tell whether the migration did anything.
CREATE TABLE orders (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id           uuid,
  drop_id           text,
  drop_title        text,
  restaurant_name   text,
  price_paid        numeric NOT NULL,
  status            text NOT NULL DEFAULT 'paid',
  stripe_session_id text,
  qr_token          text NOT NULL,
  created_at        timestamptz DEFAULT now(),
  redeemed_at       timestamptz,
  phone             text,
  drop_item_id      text,
  redemption_status text DEFAULT 'pending',
  quantity          integer NOT NULL DEFAULT 1,
  no_show           boolean DEFAULT false,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_qr_token_key UNIQUE (qr_token),
  CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT chk_quantity CHECK (quantity >= 1 AND quantity <= 4)
);

CREATE INDEX idx_orders_drop_item_status ON orders (drop_item_id, status);
-- uq_qr_token duplicates orders_qr_token_key in production. Reproduced
-- because the capture shows it, and because a migration that trips over
-- it here would trip over it there.
CREATE UNIQUE INDEX uq_qr_token          ON orders (qr_token);
CREATE UNIQUE INDEX uq_phone_drop_item   ON orders (phone, drop_item_id) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uq_stripe_session    ON orders (stripe_session_id);

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

INSERT INTO restaurants (name, slug) VALUES ('Fixture Kitchen', 'fixture');
INSERT INTO drop_items (id, title, restaurant_name, price, total_spots, start_time, end_time, is_active)
VALUES ('drop-main', 'Main Drop', 'Fixture Kitchen', 10, 100, now() + interval '1 hour', now() + interval '2 hours', true),
       ('drop-tiny', 'Tiny Drop', 'Fixture Kitchen', 10, 2,   now() + interval '1 hour', now() + interval '2 hours', true);
`;
const schemaRes = sql(schema);
check("orders + drop_items + constraints + indexes created", schemaRes.ok, schemaRes.out.slice(0, 300));

check(
  "chk_quantity is present (1..4)",
  one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid='public.orders'::regclass AND conname='chk_quantity';`)
    .includes("quantity >= 1"),
);
for (const idx of ["uq_stripe_session", "uq_phone_drop_item", "uq_qr_token", "orders_qr_token_key"]) {
  check(
    `${idx} exists and is UNIQUE`,
    one(`SELECT indexdef FROM pg_indexes WHERE tablename='orders' AND indexname='${idx}';`)
      .includes("UNIQUE"),
  );
}
check(
  "uq_phone_drop_item is partial (WHERE phone IS NOT NULL)",
  one(`SELECT indexdef FROM pg_indexes WHERE tablename='orders' AND indexname='uq_phone_drop_item';`)
    .includes("WHERE (phone IS NOT NULL)"),
);

// ─── The captured function, verbatim ────────────────────────────────
// This is production's definition exactly as captured: nine arguments, no
// tag. The migration must transform THIS.
const capturedFunction = `
CREATE OR REPLACE FUNCTION public.create_order_atomic(p_stripe_session_id text, p_phone text, p_drop_item_id text, p_drop_title text, p_restaurant_name text, p_price_paid numeric, p_quantity integer, p_qr_token text, p_total_spots integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_existing RECORD;
  v_total_sold INTEGER;
  v_order RECORD;
BEGIN
  SELECT id INTO v_existing FROM orders WHERE stripe_session_id = p_stripe_session_id;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate', 'order_id', v_existing.id);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_drop_item_id));

  SELECT COALESCE(SUM(quantity), 0) INTO v_total_sold
    FROM orders WHERE drop_item_id = p_drop_item_id AND status = 'paid';

  IF v_total_sold + p_quantity > p_total_spots THEN
    RETURN jsonb_build_object('status', 'oversold', 'total_sold', v_total_sold);
  END IF;

  INSERT INTO orders (
    phone, drop_item_id, drop_id, drop_title, restaurant_name,
    price_paid, quantity, status, redemption_status,
    stripe_session_id, qr_token
  ) VALUES (
    p_phone, p_drop_item_id, p_drop_item_id, p_drop_title, p_restaurant_name,
    p_price_paid, p_quantity, 'paid', 'pending',
    p_stripe_session_id, p_qr_token
  ) RETURNING * INTO v_order;

  RETURN jsonb_build_object('status', 'created', 'order_id', v_order.id, 'qr_token', v_order.qr_token);
END;
$function$;

-- Reproduce the captured ACL on the PRE-migration function, so the
-- migration is seen to rebuild it rather than inherit it.
ALTER FUNCTION public.create_order_atomic(text,text,text,text,text,numeric,integer,text,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_order_atomic(text,text,text,text,text,numeric,integer,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,numeric,integer,text,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(text,text,text,text,text,numeric,integer,text,integer) TO postgres, anon, authenticated, service_role;
`;
const fnRes = sql(capturedFunction);
check("captured 9-argument function created", fnRes.ok, fnRes.out.slice(0, 300));

const aclBefore = one(`SELECT proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='public' AND p.proname='create_order_atomic';`);
console.log(`  pre-migration ACL : ${aclBefore}`);

// ═══════════════════════════════════════════════════════════════════════
// BEFORE: the function behaves as production does
// ═══════════════════════════════════════════════════════════════════════

section("Before the migration");

const call9 = (sid, over = {}) => {
  const a = {
    sid: `'${sid}'`, phone: `'+1310555${String(Math.floor(Math.random() * 9000) + 1000)}'`,
    drop: `'drop-main'`, title: `'T'`, rest: `'R'`, price: "10", qty: "1",
    qr: `'qr-${sid}'`, spots: "100", ...over,
  };
  return `SELECT create_order_atomic(${a.sid}, ${a.phone}, ${a.drop}, ${a.title}, ${a.rest}, ${a.price}, ${a.qty}, ${a.qr}, ${a.spots});`;
};

check("9-arg call succeeds before the migration",
  one(call9("pre-1")).includes('"status" : "created"') || one(call9("pre-2")).includes("created"));
check("orders has NO tag column before the migration",
  one(`SELECT count(*) FROM information_schema.columns
       WHERE table_name='orders' AND column_name='tag';`) === "0");

// ═══════════════════════════════════════════════════════════════════════
// APPLY
// ═══════════════════════════════════════════════════════════════════════

section("Applying migration-012-order-tag.sql");

const applied = sql(fs.readFileSync(MIGRATION, "utf8"));
check("migration applies cleanly", applied.ok, applied.out.slice(0, 600));
if (!applied.ok) {
  console.log(`\n  Aborting: the migration did not apply.\n`);
  console.log(`\n${"═".repeat(54)}\n  TOTAL: ${passed} PASS / ${failed} FAIL\n${"═".repeat(54)}\n`);
  process.exit(1);
}

const again = sql(fs.readFileSync(MIGRATION, "utf8"));
check("migration is safe to re-run (idempotent)", again.ok, again.out.slice(0, 300));

// ═══════════════════════════════════════════════════════════════════════
// STRUCTURE
// ═══════════════════════════════════════════════════════════════════════

section("Structure after the migration");

check("orders.tag exists, nullable, no default",
  one(`SELECT is_nullable || '/' || coalesce(column_default,'none') FROM information_schema.columns
       WHERE table_name='orders' AND column_name='tag';`) === "YES/none");
check("idx_orders_tag is partial",
  one(`SELECT indexdef FROM pg_indexes WHERE tablename='orders' AND indexname='idx_orders_tag';`)
    .includes("WHERE (tag IS NOT NULL)"));
check("exactly ONE overload remains",
  one(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_order_atomic';`) === "1");
check("it has 10 arguments and 1 default",
  one(`SELECT pronargs || '/' || pronargdefaults FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_order_atomic';`) === "10/1");
check("owner is postgres",
  one(`SELECT pg_get_userbyid(proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_order_atomic';`) === "postgres");
check("SECURITY INVOKER preserved (prosecdef false)",
  one(`SELECT prosecdef::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_order_atomic';`) === "false");
// Split, and cast explicitly: provolatile is "char", and concatenating it
// with text silently produced an empty string rather than 'v'.
{
  const vol = one(`SELECT provolatile::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                   WHERE n.nspname='public' AND p.proname='create_order_atomic';`);
  const strict = one(`SELECT proisstrict::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname='create_order_atomic';`);
  check("volatility preserved (VOLATILE)", vol === "v", `provolatile=${JSON.stringify(vol)}`);
  check("not STRICT (CALLED ON NULL INPUT)", strict === "false", `proisstrict=${JSON.stringify(strict)}`);
}
check("returns jsonb",
  one(`SELECT prorettype::regtype::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_order_atomic';`) === "jsonb");

const aclAfter = one(`SELECT proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname='create_order_atomic';`);
console.log(`  post-migration ACL: ${aclAfter}`);
for (const entry of ["=X/postgres", "postgres=X/postgres", "anon=X/postgres",
                     "authenticated=X/postgres", "service_role=X/postgres"]) {
  check(`ACL contains ${entry}`, aclAfter.includes(entry), aclAfter);
}
check("ACL has exactly 5 entries (nothing extra granted)",
  one(`SELECT array_length(proacl,1)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_order_atomic';`) === "5", aclAfter);
check("no entry carries WITH GRANT OPTION", !aclAfter.includes("*"), aclAfter);
for (const role of ["anon", "authenticated", "service_role", "postgres",
                    "supabase_admin", "authenticator"]) {
  check(`${role} retains EXECUTE`,
    one(`SELECT has_function_privilege('${role}', p.oid, 'EXECUTE')::text
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='create_order_atomic';`) === "true");
}

// The body must be the captured body plus exactly the two edits.
const body = one(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='create_order_atomic';`);
for (const [label, fragment] of [
  ["duplicate check first", "SELECT id INTO v_existing FROM orders WHERE stripe_session_id = p_stripe_session_id"],
  ["advisory lock on the drop", "pg_advisory_xact_lock(hashtext(p_drop_item_id))"],
  ["capacity sum of paid rows", "COALESCE(SUM(quantity), 0) INTO v_total_sold"],
  ["oversell comparison", "v_total_sold + p_quantity > p_total_spots"],
  ["drop_id written from p_drop_item_id", "p_drop_item_id, p_drop_item_id"],
  ["status/redemption_status literals", "'paid', 'pending'"],
  ["created return shape", "'status', 'created', 'order_id', v_order.id, 'qr_token', v_order.qr_token"],
]) {
  check(`body preserved: ${label}`, body.includes(fragment));
}
check("body edit 1: tag is in the INSERT column list", /qr_token, tag/.test(body), "");
check("body edit 2: p_tag is in VALUES", /p_qr_token, p_tag/.test(body), "");

// ═══════════════════════════════════════════════════════════════════════
// BEHAVIOUR
// ═══════════════════════════════════════════════════════════════════════

section("9-argument compatibility (every deployed caller)");

const r9 = one(call9("post-9arg"));
check("9-arg call still resolves and creates", r9.includes("created"), r9.slice(0, 160));
check("9-arg order has tag = NULL",
  one(`SELECT coalesce(tag,'<null>') FROM orders WHERE stripe_session_id='post-9arg';`) === "<null>");
check("9-arg order wrote drop_id = drop_item_id",
  one(`SELECT (drop_id = drop_item_id)::text FROM orders WHERE stripe_session_id='post-9arg';`) === "true");
check("9-arg order is status=paid, redemption_status=pending",
  one(`SELECT status || '/' || redemption_status FROM orders WHERE stripe_session_id='post-9arg';`) === "paid/pending");

section("10-argument call (p_tag)");

const call10 = (sid, tag, over = {}) => {
  const a = {
    phone: `'+1310666${String(Math.floor(Math.random() * 9000) + 1000)}'`,
    drop: `'drop-main'`, qty: "1", spots: "100", ...over,
  };
  return `SELECT create_order_atomic('${sid}', ${a.phone}, ${a.drop}, 'T', 'R', 10, ${a.qty}, 'qr-${sid}', ${a.spots}, ${tag});`;
};

const r10 = one(call10("post-10arg", `'ramesh'`));
check("10-arg call creates", r10.includes("created"), r10.slice(0, 160));
check("10-arg order stored the tag",
  one(`SELECT tag FROM orders WHERE stripe_session_id='post-10arg';`) === "ramesh");

one(call10("post-10null", "NULL"));
check("10-arg with explicit NULL stores NULL",
  one(`SELECT coalesce(tag,'<null>') FROM orders WHERE stripe_session_id='post-10null';`) === "<null>");

check("the partial index is used for a tag lookup",
  one(`EXPLAIN (COSTS OFF) SELECT id FROM orders WHERE tag = 'ramesh';`).includes("idx_orders_tag")
  || one(`SET enable_seqscan=off; EXPLAIN (COSTS OFF) SELECT id FROM orders WHERE tag = 'ramesh';`)
       .includes("idx_orders_tag"),
  "planner chose a seq scan even with enable_seqscan off",
);

section("Sequential duplicate delivery");

const dupFirst = one(call10("dup-seq", `'first_tag'`));
check("first delivery creates", dupFirst.includes("created"));
const dupSecond = one(call10("dup-seq", `'second_tag'`, { phone: `'+13107770001'` }));
check("second delivery returns 'duplicate'", dupSecond.includes("duplicate"), dupSecond.slice(0, 160));
check("still exactly one order for that session",
  one(`SELECT count(*) FROM orders WHERE stripe_session_id='dup-seq';`) === "1");
check("a duplicate delivery CANNOT change the stored tag",
  one(`SELECT tag FROM orders WHERE stripe_session_id='dup-seq';`) === "first_tag");

const dupNoTag = one(call9("dup-seq"));
check("a 9-arg retry also returns 'duplicate'", dupNoTag.includes("duplicate"));
check("and still cannot clear the stored tag",
  one(`SELECT tag FROM orders WHERE stripe_session_id='dup-seq';`) === "first_tag");

// ═══════════════════════════════════════════════════════════════════════
// CONCURRENT duplicate delivery — two real connections
// ═══════════════════════════════════════════════════════════════════════

async function concurrentTest() {
  section("Concurrent duplicate delivery (two real connections)");

  // The captured body checks for an existing session id BEFORE taking the
  // advisory lock. Two simultaneous deliveries therefore both pass that
  // check. Session A holds the lock inside an open transaction; B blocks
  // on it, and only reaches its INSERT after A commits — by which point
  // uq_stripe_session is there to stop it.
  const SID = "dup-concurrent";

  const a = sqlAsync(
    `BEGIN;
     SELECT create_order_atomic('${SID}', '+13108880001', 'drop-main', 'T', 'R', 10, 1, 'qr-${SID}-a', 100, 'tag_a');
     SELECT pg_sleep(2);
     COMMIT;`,
    "a",
  );

  await sleep(600); // B starts while A is mid-transaction, holding the lock.

  const b = sqlAsync(
    `BEGIN;
     SELECT create_order_atomic('${SID}', '+13108880002', 'drop-main', 'T', 'R', 10, 1, 'qr-${SID}-b', 100, 'tag_b');
     COMMIT;`,
    "b",
  );

  const [ra, rb] = await Promise.all([a, b]);

  check("session A succeeded", ra.code === 0, `exit=${ra.code} ${ra.err.slice(0, 200)}`);

  const bFailed = rb.code !== 0;
  const bUnique = /duplicate key value violates unique constraint/i.test(rb.err)
    && /uq_stripe_session/i.test(rb.err);
  const bDuplicate = rb.code === 0 && rb.out.includes("duplicate");

  // Report what ACTUALLY happened rather than only asserting a guess.
  console.log(`  observed: A exit=${ra.code}, B exit=${rb.code}`);
  if (rb.err) console.log(`  B stderr: ${rb.err.split("\n")[0].slice(0, 160)}`);
  if (rb.out) console.log(`  B stdout: ${rb.out.split("\n")[0].slice(0, 160)}`);

  check(
    "B did NOT silently create a second order",
    bFailed || bDuplicate,
    `B exited 0 with output ${rb.out.slice(0, 120)}`,
  );
  check(
    "B's collision is uq_stripe_session (the index is what stops it)",
    bUnique,
    bDuplicate
      ? "B instead returned 'duplicate' — A committed before B passed its check"
      : rb.err.split("\n")[0].slice(0, 200),
  );
  check(
    "exactly ONE order exists for the contended session id",
    one(`SELECT count(*) FROM orders WHERE stripe_session_id='${SID}';`) === "1",
    `count=${one(`SELECT count(*) FROM orders WHERE stripe_session_id='${SID}';`)}`,
  );
  check(
    "the surviving order carries A's tag, not B's",
    one(`SELECT tag FROM orders WHERE stripe_session_id='${SID}';`) === "tag_a",
  );
  check(
    "B's row was never committed (its qr_token does not exist)",
    one(`SELECT count(*) FROM orders WHERE qr_token='qr-${SID}-b';`) === "0",
  );

  // ── Oversell, unchanged ───────────────────────────────────────────
  section("Oversell path (unchanged)");

  const o1 = one(call10("oversell-1", `'t1'`, { drop: `'drop-tiny'`, qty: "2", spots: "2", phone: `'+13109990001'` }));
  check("a 2-spot drop accepts 2", o1.includes("created"), o1.slice(0, 160));
  const o2 = one(call10("oversell-2", `'t2'`, { drop: `'drop-tiny'`, qty: "1", spots: "2", phone: `'+13109990002'` }));
  check("the next order is refused as 'oversold'", o2.includes("oversold"), o2.slice(0, 160));
  check("oversold reports total_sold", o2.includes("total_sold"));
  check("no row was written for the oversold attempt",
    one(`SELECT count(*) FROM orders WHERE stripe_session_id='oversell-2';`) === "0");
  check("an oversold call with a tag still writes nothing",
    one(`SELECT count(*) FROM orders WHERE tag='t2';`) === "0");

  // ── chk_quantity still bites ──────────────────────────────────────
  const bad = sql(call10("qty-bad", `'t3'`, { qty: "5", phone: `'+13109990003'` }));
  check("chk_quantity (1..4) still rejects quantity=5",
    !bad.ok && /chk_quantity/.test(bad.out), bad.ok ? "accepted" : bad.out.slice(0, 160));

  // ── uq_phone_drop_item still bites ────────────────────────────────
  one(call10("phone-dup-1", `'t4'`, { phone: `'+13101110001'` }));
  const phoneDup = sql(call10("phone-dup-2", `'t5'`, { phone: `'+13101110001'` }));
  check("uq_phone_drop_item still blocks a second claim on the same drop",
    !phoneDup.ok && /uq_phone_drop_item/.test(phoneDup.out),
    phoneDup.ok ? "accepted" : phoneDup.out.slice(0, 160));

  // ── Pre-existing rows untouched ───────────────────────────────────
  section("Pre-existing rows");
  check("rows created before the migration still have tag NULL",
    one(`SELECT count(*) FROM orders WHERE stripe_session_id LIKE 'pre-%' AND tag IS NOT NULL;`) === "0");
  check("and are otherwise intact",
    Number(one(`SELECT count(*) FROM orders WHERE stripe_session_id LIKE 'pre-%';`)) >= 1);

  console.log(`\n${"═".repeat(54)}`);
  console.log(`  TOTAL: ${passed} PASS / ${failed} FAIL`);
  console.log(`${"═".repeat(54)}\n`);
  if (failures.length > 0) {
    console.log("FAILED TESTS:");
    failures.forEach((f) => console.log(`  ✗ ${f.n} — ${f.r}`));
    console.log("");
  }
  process.exit(failed > 0 ? 1 : 0);
}

concurrentTest().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
