-- ═════════════════════════════════════════════════════════════════════
-- DealsPro: Studio sharing — channel registry and channel events
--
-- Backs Studio → Drops → Share: reusable named channels, each with a
-- stable code that becomes the `?tag=` on a shared link, plus the three
-- measurements that `orders` cannot supply on its own.
--
-- CHANNEL attribution only. Unrelated to `restaurants.tags` (cuisine
-- tags) and to any drop categorization concept.
--
-- ─── WHAT THIS ADDS ─────────────────────────────────────────────────
--   1. share_channels          — the registry. Immutable code, editable
--                                label, active flag.
--   2. channel_events          — link copies, page visits and created
--                                Stripe checkout sessions, deduplicated.
--   3. channel_instrumentation — one row recording when measurement
--                                began, so the UI can say "measured
--                                since" instead of showing a missing
--                                past as zero.
--
-- Nothing existing is touched. No column, constraint, index, policy,
-- grant or row on `orders`, `drop_items`, `restaurants`, `users` or any
-- other table is altered, and no function permission is changed.
--
-- ─── WHY THE CODE IS IMMUTABLE ──────────────────────────────────────
-- `orders.tag` stores the code STRING, not a foreign key. Rewriting a
-- code would silently detach every live link and every historical order
-- that carries it. So the code is write-once: renaming edits `label`
-- only, and retiring a channel sets `is_active = false` rather than
-- deleting the row. There is deliberately NO foreign key from
-- `orders.tag` to this table — a tag that predates the registry, or
-- whose channel was never registered, must still report under its own
-- recorded code.
--
-- ─── WHY channel_events IS SEPARATE FROM orders ─────────────────────
-- A copy, a visit and a created checkout session are not orders and must
-- never be joined to them row-for-row. They live in their own table,
-- aggregated independently, and the application never joins the two.
--
-- Tracking input arrives from a browser and is untrusted: `tag` is
-- CHECK-constrained to the same shape the application normalizer
-- enforces, `dedupe_key` is length-bounded, and a UNIQUE index on it is
-- what makes a retried beacon or a replayed request a no-op rather than
-- an inflated count.
--
-- NO customer data lives here. No phone, no qr_token, no Stripe secret,
-- no payment identifier beyond the checkout session id used as a dedupe
-- key. Nothing in this table identifies a person.
--
-- ─── DEPLOY ORDER ───────────────────────────────────────────────────
--   1. Apply THIS migration.
--   2. Run the read-only verification at the end of this file.
--   3. Deploy the code.
-- Applying before deploying is safe: nothing reads these tables until
-- the Share panel ships. Deploying first is also safe — the application
-- degrades to "not tracked" and the Share panel reports the migration as
-- missing rather than erroring.
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Preconditions ──────────────────────────────────────────────────
DO $dp013_pre$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'public.orders does not exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tag'
  ) THEN
    RAISE EXCEPTION
      'orders.tag is missing — apply migration-012-order-tag.sql first, '
      'or channel results would have nothing to report against.';
  END IF;
END
$dp013_pre$;

-- ─── 1. The channel registry ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS share_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WRITE-ONCE. This is what lands in a URL and in orders.tag. Same
  -- shape the application's normalizeTag() enforces, so a code can never
  -- be created that the resolver would reject.
  code        text NOT NULL,

  -- Editable. Renaming changes this and nothing else.
  label       text NOT NULL,

  -- Retirement, not deletion. An inactive channel disappears from new
  -- selections; its links keep working and its history keeps reporting.
  is_active   boolean NOT NULL DEFAULT true,

  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT share_channels_code_format CHECK (code ~ '^[a-z0-9_-]{1,64}$'),
  CONSTRAINT share_channels_label_len
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_share_channels_code ON share_channels (code);
CREATE INDEX IF NOT EXISTS idx_share_channels_active
  ON share_channels (is_active, label);

COMMENT ON COLUMN share_channels.code IS
  'Immutable. Becomes ?tag= on shared links and orders.tag on purchases. '
  'Never rewritten: doing so would detach live links and historical orders.';
COMMENT ON COLUMN share_channels.label IS
  'Display name. Editable; renaming never touches code.';

-- Reuse the trigger function migration-002 installed, so updated_at is
-- maintained by the database rather than by whichever caller remembers.
DROP TRIGGER IF EXISTS update_share_channels_updated_at ON share_channels;
CREATE TRIGGER update_share_channels_updated_at
BEFORE UPDATE ON share_channels
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ─── 2. Channel events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'copy'             — an operator's clipboard write SUCCEEDED. Not
  --                      evidence the link was ever sent to anyone.
  -- 'visit'            — a customer drop page actually rendered in a
  --                      browser. Not a unique person, not reach.
  -- 'checkout_session' — Stripe returned a session. Not a payment.
  event_type    text NOT NULL,

  drop_item_id  text,

  -- NULL = untagged. No foreign key, deliberately: an unknown tag must
  -- still report under its own code.
  tag           text,

  -- What makes a retry a no-op. 'copy:<id>' / 'visit:<id>' /
  -- 'checkout:<stripe session id>'.
  dedupe_key    text NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT channel_events_type
    CHECK (event_type IN ('copy', 'visit', 'checkout_session')),
  CONSTRAINT channel_events_tag_format
    CHECK (tag IS NULL OR tag ~ '^[a-z0-9_-]{1,64}$'),
  CONSTRAINT channel_events_dedupe_len
    CHECK (char_length(dedupe_key) BETWEEN 8 AND 200),
  CONSTRAINT channel_events_drop_len
    CHECK (drop_item_id IS NULL OR char_length(drop_item_id) <= 200)
);

-- The whole dedupe guarantee. A replayed beacon or a retried webhook
-- collides here and is swallowed by the caller as a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_events_dedupe
  ON channel_events (dedupe_key);

CREATE INDEX IF NOT EXISTS idx_channel_events_drop_type
  ON channel_events (drop_item_id, event_type);

COMMENT ON TABLE channel_events IS
  'Link copies, page visits and created Stripe checkout sessions, by '
  'channel. Contains no customer data: no phone, no qr_token, no payment '
  'secret. Never joined row-for-row to orders.';

-- ─── 3. When measurement began ──────────────────────────────────────
-- Without this, an empty events table is indistinguishable from "this
-- was never measured", and the UI would be free to render a missing past
-- as a confident zero.
CREATE TABLE IF NOT EXISTS channel_instrumentation (
  id         boolean PRIMARY KEY DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_instrumentation_single_row CHECK (id)
);

INSERT INTO channel_instrumentation (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE channel_instrumentation IS
  'Single row. started_at is the instant copies/visits/checkout sessions '
  'began being recorded. Counts before it do not exist and must never be '
  'displayed as zero.';

-- ─── Privileges: deny-all to browser roles ──────────────────────────
-- Same posture as drop_submissions and intake_links: RLS on, zero
-- policies, so anon and authenticated can read and write nothing. Every
-- access goes through the service-role client behind requireAdmin() or
-- behind the server-side event recorder.
--
-- TRUNCATE, REFERENCES and TRIGGER are table-level privileges that RLS
-- does NOT govern, and Supabase's default grants hand them to anon on
-- every new public table. Revoked explicitly.
ALTER TABLE share_channels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_instrumentation ENABLE ROW LEVEL SECURITY;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON share_channels          FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON channel_events          FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON channel_instrumentation FROM anon, authenticated;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- VERIFICATION — read-only, run after COMMIT
-- ═════════════════════════════════════════════════════════════════════

-- A. All three tables exist, RLS on, zero policies.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
       CASE WHEN c.relrowsecurity
             AND (SELECT count(*) FROM pg_policies p
                   WHERE p.schemaname = 'public' AND p.tablename = c.relname) = 0
            THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relname IN ('share_channels', 'channel_events', 'channel_instrumentation')
ORDER BY c.relname;

-- B. No browser role holds a table-level privilege RLS cannot govern.
--    Expect ZERO rows.
SELECT r.grantee, t.tbl AS table_name, p.priv AS privilege, 'STILL GRANTED — FAIL' AS verdict
FROM (VALUES ('anon'), ('authenticated')) AS r(grantee)
CROSS JOIN (VALUES ('share_channels'), ('channel_events'),
                   ('channel_instrumentation')) AS t(tbl)
CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
WHERE has_table_privilege(r.grantee, 'public.' || t.tbl, p.priv)
ORDER BY t.tbl, r.grantee, p.priv;

SELECT count(*) AS client_privileges_remaining,
       CASE WHEN count(*) = 0 THEN 'PASS — none of the 18 remain'
            ELSE 'FAIL — see the grid above' END AS verdict
FROM (VALUES ('anon'), ('authenticated')) AS r(grantee)
CROSS JOIN (VALUES ('share_channels'), ('channel_events'),
                   ('channel_instrumentation')) AS t(tbl)
CROSS JOIN (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
WHERE has_table_privilege(r.grantee, 'public.' || t.tbl, p.priv);

-- C. The constraints that carry the guarantees.
SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.share_channels'::regclass,
                   'public.channel_events'::regclass,
                   'public.channel_instrumentation'::regclass)
  AND contype = 'c'
ORDER BY 1, 2;

-- D. The unique indexes that make codes unique and retries idempotent.
SELECT indexname, indexdef,
       CASE WHEN indexdef LIKE 'CREATE UNIQUE%' THEN 'PASS' ELSE 'FAIL — not unique' END AS verdict
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('uq_share_channels_code', 'uq_channel_events_dedupe')
ORDER BY indexname;

-- E. Instrumentation start recorded, exactly one row.
SELECT count(*) AS rows, min(started_at) AS measurement_began,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL — expected exactly one row' END AS verdict
FROM channel_instrumentation;

-- F. Nothing existing was disturbed: orders still has its own indexes.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'orders'
ORDER BY indexname;
