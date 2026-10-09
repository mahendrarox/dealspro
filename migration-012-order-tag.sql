-- ═════════════════════════════════════════════════════════════════════
-- DealsPro: order channel attribution — `orders.tag`
--
-- Records WHO SHARED the link that produced an order. `?tag=<name>` is
-- carried from the smart URL or drop page, through checkout, into Stripe
-- metadata, and is written here by create_order_atomic.
--
-- This is CHANNEL attribution. It is unrelated to any drop categorization
-- concept; there is no `drop_tag` anywhere in this system.
--
-- ─── WHAT THIS CHANGES ──────────────────────────────────────────────
--   1. orders.tag            — new nullable text column
--   2. idx_orders_tag        — partial index, tagged rows only
--   3. create_order_atomic   — gains a 10th parameter, p_tag, and writes
--                              it. The function is DROPped and recreated
--                              because a new parameter is a new signature;
--                              CREATE OR REPLACE would leave two overloads.
--
-- Nothing else. No other column, constraint, index, grant, policy or row
-- on any table is touched.
--
-- ─── THE BODY IS THE CAPTURED BODY ──────────────────────────────────
-- The function below is production's definition as captured from
-- pg_get_functiondef, reproduced byte for byte, with exactly two edits:
--
--   * the signature gains `p_tag text DEFAULT NULL` in last position;
--   * the INSERT gains `tag` in its column list and `p_tag` in VALUES.
--
-- Everything else is untouched and deliberately so: the duplicate check,
-- the advisory lock on hashtext(p_drop_item_id), the capacity check, the
-- `drop_id := p_drop_item_id` write, the three return shapes, SECURITY
-- INVOKER, VOLATILE, non-STRICT, LANGUAGE plpgsql, RETURNS jsonb.
--
-- ─── WHY p_tag MUST HAVE A DEFAULT ──────────────────────────────────
-- PostgREST resolves an RPC by its NAMED ARGUMENT SET. Every deployed
-- caller and all 23 call sites in scripts/test-regression.js send the
-- original nine names. `DEFAULT NULL` is what keeps those resolving; drop
-- it and every one of them fails PGRST202 the moment this is applied.
--
-- ─── DEPLOY ORDER (mandatory) ───────────────────────────────────────
--   1. Apply THIS migration.
--   2. Run the read-only verification at the end of this file.
--   3. Deploy the code.
-- Applying before deploying is safe: the running webhook sends nine
-- arguments, which still resolve, and writes no tag.
--
-- Supabase reloads the PostgREST schema cache on DDL via event trigger.
-- If a 10-argument call still returns PGRST202 a minute after COMMIT,
-- force it with:  NOTIFY pgrst, 'reload schema';
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Preconditions ──────────────────────────────────────────────────
-- Fail loudly rather than half-apply. A missing table or a second
-- overload means the capture this migration was built from no longer
-- describes the database in front of it.
DO $dp012_pre$
DECLARE
  v_overloads integer;
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'public.orders does not exist';
  END IF;

  SELECT count(*) INTO v_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION
      'expected exactly 1 create_order_atomic overload, found %. '
      'Re-capture before applying.', v_overloads;
  END IF;
END
$dp012_pre$;

-- ─── 1. The column ──────────────────────────────────────────────────
-- Nullable with no default: every existing row stays exactly as it is,
-- and NULL means "no attribution recorded", not "attributed to nothing".
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tag text NULL;

COMMENT ON COLUMN orders.tag IS
  'Channel attribution: who shared the link that produced this order. '
  'Normalized to ^[a-z0-9_-]{1,64}$ by the application before it is '
  'stored. NULL = untagged. Internal only; never returned to customers.';

-- ─── 2. The index ───────────────────────────────────────────────────
-- Partial: the overwhelming majority of rows are untagged, and no query
-- will ever ask for them by tag.
CREATE INDEX IF NOT EXISTS idx_orders_tag ON orders (tag) WHERE tag IS NOT NULL;

-- ─── 3. The function ────────────────────────────────────────────────
-- Plain DROP, never CASCADE. The capture shows no non-internal
-- dependents, so this can remove nothing but the function itself — and
-- if that ever stops being true, this should fail rather than quietly
-- take something with it.
DROP FUNCTION IF EXISTS public.create_order_atomic(
  text, text, text, text, text, numeric, integer, text, integer
);

CREATE OR REPLACE FUNCTION public.create_order_atomic(p_stripe_session_id text, p_phone text, p_drop_item_id text, p_drop_title text, p_restaurant_name text, p_price_paid numeric, p_quantity integer, p_qr_token text, p_total_spots integer, p_tag text DEFAULT NULL)
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
    stripe_session_id, qr_token, tag
  ) VALUES (
    p_phone, p_drop_item_id, p_drop_item_id, p_drop_title, p_restaurant_name,
    p_price_paid, p_quantity, 'paid', 'pending',
    p_stripe_session_id, p_qr_token, p_tag
  ) RETURNING * INTO v_order;

  RETURN jsonb_build_object('status', 'created', 'order_id', v_order.id, 'qr_token', v_order.qr_token);
END;
$function$;

-- ─── 4. Owner and privileges ────────────────────────────────────────
-- A DROP discards the old ACL, so it has to be rebuilt. These statements
-- reproduce the captured proacl exactly:
--
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,
--    authenticated=X/postgres,service_role=X/postgres}
--
-- No entry carries WITH GRANT OPTION (no `*` in the capture), so none is
-- granted here. PUBLIC=X is reproduced deliberately: it is what gives
-- supabase_admin and authenticator the EXECUTE the capture's privilege
-- matrix shows them holding, and removing it would be a behaviour change
-- this migration has no mandate to make.
ALTER FUNCTION public.create_order_atomic(
  text, text, text, text, text, numeric, integer, text, integer, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_order_atomic(
  text, text, text, text, text, numeric, integer, text, integer, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(
  text, text, text, text, text, numeric, integer, text, integer, text
) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_order_atomic(
  text, text, text, text, text, numeric, integer, text, integer, text
) TO postgres, anon, authenticated, service_role;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- VERIFICATION — read-only, run after COMMIT
-- ═════════════════════════════════════════════════════════════════════

-- A. The column, nullable, no default.
SELECT column_name, data_type, is_nullable,
       COALESCE(column_default, '(none)') AS column_default,
       CASE WHEN is_nullable = 'YES' AND column_default IS NULL
            THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tag';

-- B. The partial index.
SELECT indexname, indexdef,
       CASE WHEN indexdef LIKE '%WHERE (tag IS NOT NULL)%'
            THEN 'PASS' ELSE 'FAIL — not partial' END AS verdict
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'orders' AND indexname = 'idx_orders_tag';

-- C. EXACTLY ONE overload, with ten arguments and one default.
SELECT p.oid::regprocedure::text AS signature,
       p.pronargs, p.pronargdefaults,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.provolatile AS volatility,
       p.proisstrict AS is_strict,
       CASE WHEN p.pronargs = 10 AND p.pronargdefaults = 1
             AND pg_get_userbyid(p.proowner) = 'postgres'
             AND p.prosecdef = false AND p.provolatile = 'v'
             AND p.proisstrict = false
            THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic';

SELECT count(*) AS overload_count,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL — more than one overload' END AS verdict
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic';

-- D. The ACL, as a set. Array ORDER is not significant to PostgreSQL;
--    what must match is the membership.
SELECT p.proacl::text AS actual_acl,
       CASE WHEN (
         SELECT bool_and(e = ANY (p.proacl::text[]))
         FROM unnest(ARRAY['=X/postgres','postgres=X/postgres','anon=X/postgres',
                           'authenticated=X/postgres','service_role=X/postgres']) e
       ) AND array_length(p.proacl, 1) = 5
       THEN 'PASS' ELSE 'FAIL — compare against the capture' END AS verdict
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic';

-- E. Effective EXECUTE for every role in the captured matrix.
SELECT r AS role,
       has_function_privilege(r, p.oid, 'EXECUTE') AS can_execute,
       CASE WHEN has_function_privilege(r, p.oid, 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL — lost EXECUTE' END AS verdict
FROM unnest(ARRAY['anon','authenticated','service_role','postgres',
                  'supabase_admin','authenticator']) r
CROSS JOIN (
  SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic'
) p
ORDER BY r;

-- F. Existing rows are untouched.
SELECT count(*) AS total_orders,
       count(*) FILTER (WHERE tag IS NULL) AS untagged,
       count(*) FILTER (WHERE tag IS NOT NULL) AS tagged,
       CASE WHEN count(*) FILTER (WHERE tag IS NOT NULL) = 0
            THEN 'PASS — every pre-existing row is untagged, as expected'
            ELSE 'NOTE — some rows already carry a tag' END AS verdict
FROM orders;

-- G. The indexes this migration must NOT have disturbed.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'orders'
ORDER BY indexname;
