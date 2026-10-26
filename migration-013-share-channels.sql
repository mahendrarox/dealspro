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
--   3. channel_instrumentation — one row recording the FIRST RECORDED
--                                ACTIVITY, so the UI can name a real
--                                instant instead of showing a missing
--                                past as zero.
--   4. record_channel_event()  — inserts one event and initializes that
--                                timestamp in the SAME transaction.
--   5. channel_tags_in_use()   — the tags already present in the data,
--                                so a new channel cannot be handed a
--                                code that a historical tag already owns.
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
-- ─── WHY THE TIMESTAMP IS "FIRST RECORDED ACTIVITY" ─────────────────
-- An earlier revision of this file stamped the timestamp with now() at
-- APPLY time and called it the start of measurement. That was wrong.
-- This file is applied before the code that records anything is
-- deployed, so every hour between the two would have been presented as
-- measured and empty — a fabricated zero across real activity.
--
-- The column is therefore NULL until the first event is actually
-- recorded, and record_channel_event() sets it in the same transaction
-- as that insert. It is not the deployment instant and not the instant
-- tracking became able to run: it is the first activity that was
-- actually captured, which is the only one of the three this database
-- can observe. The UI must label it as exactly that.
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

-- Write-once, enforced HERE rather than trusted to the application.
-- The application never writes `code` on update, but a console session,
-- a future action or a later migration could. `orders.tag` stores this
-- string, so rewriting it would silently detach every live link and
-- every historical order carrying it — the one change this schema must
-- make impossible rather than merely discourage.
CREATE OR REPLACE FUNCTION share_channels_code_write_once()
RETURNS trigger
LANGUAGE plpgsql
AS $dp013_woc$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION
      'share_channels.code is write-once: % cannot become %. '
      'Renaming a channel edits label only.',
      OLD.code, NEW.code
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$dp013_woc$;

DROP TRIGGER IF EXISTS share_channels_code_write_once ON share_channels;
CREATE TRIGGER share_channels_code_write_once
BEFORE UPDATE ON share_channels
FOR EACH ROW
EXECUTE FUNCTION share_channels_code_write_once();

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

-- ─── 3. First recorded activity ─────────────────────────────────────
-- Without this, an empty events table is indistinguishable from "this
-- was never measured", and the UI would be free to render a missing past
-- as a confident zero.
--
-- NULL until something is actually recorded. See the header: a timestamp
-- written when this file is APPLIED would claim measurement over the
-- window before the code deployed.
CREATE TABLE IF NOT EXISTS channel_instrumentation (
  id             boolean PRIMARY KEY DEFAULT true,
  first_event_at timestamptz,
  CONSTRAINT channel_instrumentation_single_row CHECK (id)
);

-- Convert a table left by the earlier revision of this file, which had
-- `started_at timestamptz NOT NULL DEFAULT now()`. Idempotent: on a
-- fresh install every branch below is a no-op.
DO $dp013_inst$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'channel_instrumentation'
      AND column_name  = 'started_at'
  ) THEN
    ALTER TABLE channel_instrumentation RENAME COLUMN started_at TO first_event_at;
  END IF;

  ALTER TABLE channel_instrumentation ALTER COLUMN first_event_at DROP NOT NULL;
  ALTER TABLE channel_instrumentation ALTER COLUMN first_event_at DROP DEFAULT;
END
$dp013_inst$;

INSERT INTO channel_instrumentation (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- A stamp earlier than the earliest event that exists cannot be "first
-- recorded activity" — it is an apply-time stamp. Replace it with the
-- truth, which is NULL when nothing has been recorded at all.
UPDATE channel_instrumentation ci
   SET first_event_at = (SELECT min(created_at) FROM channel_events)
 WHERE ci.first_event_at IS NOT NULL
   AND ci.first_event_at < COALESCE(
         (SELECT min(created_at) FROM channel_events),
         'infinity'::timestamptz);

COMMENT ON COLUMN channel_instrumentation.first_event_at IS
  'The first copy/visit/checkout-session actually RECORDED. NULL until '
  'one is. Not the deployment instant and not the instant tracking '
  'became able to run — neither is observable here. Nothing before it '
  'was measured, and must never be displayed as zero.';

-- ─── 4. Recording an event ──────────────────────────────────────────
-- One statement for the caller, one transaction in the database: the
-- insert and the initialization of first_event_at either both happen or
-- neither does. That is why this is a function and not two round trips
-- — a fire-and-forget second write could be lost, leaving a recorded
-- event with no recorded start.
--
-- Returns 'recorded' or 'duplicate'. A duplicate dedupe_key is SUCCESS,
-- not an error: it is how a retried beacon, a double-invoked effect or a
-- replayed request is made a no-op rather than an inflated count.
CREATE OR REPLACE FUNCTION record_channel_event(
  p_event_type   text,
  p_drop_item_id text,
  p_tag          text,
  p_dedupe_key   text
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $dp013_rec$
DECLARE
  v_at timestamptz := now();
BEGIN
  INSERT INTO channel_events (event_type, drop_item_id, tag, dedupe_key, created_at)
  VALUES (p_event_type, p_drop_item_id, p_tag, p_dedupe_key, v_at);

  -- Same transaction. Only ever written once: the guard makes a second
  -- event leave the first one's timestamp alone.
  UPDATE channel_instrumentation
     SET first_event_at = v_at
   WHERE id = true AND first_event_at IS NULL;

  RETURN 'recorded';
EXCEPTION
  WHEN unique_violation THEN
    RETURN 'duplicate';
END
$dp013_rec$;

-- ─── 5. Tags already present in the data ────────────────────────────
-- A historical tag that no channel ever registered still owns its code.
-- Creating a channel whose code collided with one would silently hand
-- that channel every past order carrying it. The registry alone cannot
-- see those tags, so this exposes them.
--
-- Read-only and STABLE. Returns codes only — no order, no customer, no
-- amount, nothing identifying.
CREATE OR REPLACE FUNCTION channel_tags_in_use()
RETURNS TABLE (tag text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $dp013_tiu$
  SELECT DISTINCT o.tag FROM orders o WHERE o.tag IS NOT NULL
  UNION
  SELECT DISTINCT e.tag FROM channel_events e WHERE e.tag IS NOT NULL
$dp013_tiu$;

-- Neither function is reachable from a browser role. Both run behind the
-- service-role client, which is behind requireAdmin() or behind the
-- server-side recorder. Guarded because a role may not exist on a
-- throwaway cluster.
DO $dp013_fnacl$
DECLARE
  r text;
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION record_channel_event(text, text, text, text) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION channel_tags_in_use() FROM PUBLIC';
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION record_channel_event(text, text, text, text) FROM %I', r);
      EXECUTE format('REVOKE ALL ON FUNCTION channel_tags_in_use() FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION record_channel_event(text, text, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION channel_tags_in_use() TO service_role';
  END IF;
END
$dp013_fnacl$;

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

-- E. Exactly one instrumentation row, and it does NOT claim activity
--    that predates the first recorded event. On a fresh apply
--    first_event_at is NULL — that is correct, not a failure: nothing
--    has been recorded yet, and the UI must say so rather than show a
--    zero.
SELECT count(*) AS rows,
       min(first_event_at) AS first_recorded_activity,
       (SELECT min(created_at) FROM channel_events) AS earliest_event,
       CASE
         WHEN count(*) <> 1 THEN 'FAIL — expected exactly one row'
         WHEN min(first_event_at) IS NULL
          AND NOT EXISTS (SELECT 1 FROM channel_events)
              THEN 'PASS — nothing recorded yet, nothing claimed'
         WHEN min(first_event_at) = (SELECT min(created_at) FROM channel_events)
              THEN 'PASS — matches the earliest recorded event'
         ELSE 'FAIL — timestamp does not match the first recorded event'
       END AS verdict
FROM channel_instrumentation;

-- F. The write-once trigger on share_channels.code is installed.
-- tgenabled is type "char", which has no unambiguous || operator
-- against an untyped literal. Cast it explicitly or this query errors.
SELECT tgname,
       CASE WHEN tgenabled = 'O' THEN 'PASS — enabled'
            ELSE 'FAIL — disabled (' || tgenabled::text || ')' END AS verdict
FROM pg_trigger
WHERE tgrelid = 'public.share_channels'::regclass
  AND tgname = 'share_channels_code_write_once';

-- G. Both functions exist, and no browser role can execute either.
--    Expect two PASS rows.
SELECT p.proname,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
              OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN 'FAIL — a browser role can execute this'
            ELSE 'PASS — service-role only' END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname IN ('record_channel_event', 'channel_tags_in_use')
ORDER BY p.proname;

-- H. Nothing existing was disturbed: orders still has its own indexes.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'orders'
ORDER BY indexname;
