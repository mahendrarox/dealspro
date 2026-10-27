-- ═════════════════════════════════════════════════════════════════════
-- ⚠  TEST FIXTURE — DO **NOT** RUN THIS ON PRODUCTION.  ⚠
--
-- This file RECREATES objects that already exist in production. It is
-- for the disposable test cluster ONLY, so the regression suite can run
-- against a faithful replica instead of being waived.
--
-- Running it on production would DROP AND RECREATE public.users and
-- destroy every row in it. A guard below refuses to run on a database
-- named `postgres` (Supabase's), but do not rely on the guard — do not
-- paste this into the Supabase SQL Editor at all.
--
-- ─── WHY THIS EXISTS ────────────────────────────────────────────────
-- `public.users` and `redeem_order_atomic()` have only ever existed in
-- production. They were never in version control, so a throwaway
-- cluster could not reproduce them, so `npm run test:regression` could
-- never reach 0 FAIL offline — which is what forced two merge-gate
-- exceptions to be granted on trust rather than on evidence.
--
-- Captured from production 2026-10-27 via pg_get_functiondef and
-- information_schema. Reproduced here byte-for-byte.
--
-- ─── ON THE FUNCTION'S ATTRIBUTES ───────────────────────────────────
-- The capture returned owner, ACL and prosecdef, but not provolatile or
-- proisstrict. They are not missing: pg_get_functiondef PRINTS those
-- attributes when they differ from the default and OMITS them when they
-- do not (verified against this very cluster). The captured definition
-- contains neither token, so the function is VOLATILE and
-- CALLED ON NULL INPUT — which is what is reproduced below.
-- ═════════════════════════════════════════════════════════════════════

DO $dp014_guard$
BEGIN
  IF current_database() = 'postgres' THEN
    RAISE EXCEPTION
      'REFUSING TO RUN. This is a TEST FIXTURE that drops and recreates '
      'public.users. The database is named "postgres", which is what '
      'Supabase calls the production database. If this really is a '
      'throwaway cluster, rename it or run the statements by hand.';
  END IF;
END
$dp014_guard$;

BEGIN;

-- ─── public.users ───────────────────────────────────────────────────
-- Captured shape. Note what differs from what the test cluster had been
-- guessing, because each difference is a behaviour the suite could not
-- have exercised correctly before:
--   * name  is NOT NULL in production (was nullable here)
--   * phone is NOT NULL in production (was nullable here)
--   * consent DEFAULTS TO TRUE in production (defaulted to false here)
--   * there are NO triggers on this table, so updated_at is set at
--     insert and never maintained afterwards
DROP TABLE IF EXISTS public.users CASCADE;

CREATE TABLE public.users (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  phone      text        NOT NULL,
  consent    boolean              DEFAULT true,
  created_at timestamptz          DEFAULT now(),
  updated_at timestamptz          DEFAULT now(),
  CONSTRAINT users_pkey      PRIMARY KEY (id),
  CONSTRAINT users_phone_key UNIQUE (phone)
);

-- ─── public.redeem_order_atomic(text) ───────────────────────────────
-- Body verbatim from pg_get_functiondef. Single overload, one argument.
-- The CRLF line endings are production's own and are left alone: this
-- is a capture, not a tidy-up.
CREATE OR REPLACE FUNCTION public.redeem_order_atomic(p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_order RECORD;
BEGIN
  UPDATE orders SET redemption_status = 'redeemed', redeemed_at = NOW()
  WHERE qr_token = p_qr_token AND redemption_status = 'pending'
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    SELECT * INTO v_order FROM orders WHERE qr_token = p_qr_token;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object('status', 'already_redeemed', 'order', row_to_json(v_order)::jsonb);
  END IF;

  RETURN jsonb_build_object('status', 'redeemed', 'order', row_to_json(v_order)::jsonb);
END;
$function$;

ALTER FUNCTION public.redeem_order_atomic(text) OWNER TO postgres;

-- Captured ACL: {=X/postgres,postgres=X/postgres,anon=X/postgres,
--                authenticated=X/postgres,service_role=X/postgres}
-- i.e. PUBLIC holds EXECUTE, and each role holds it explicitly. That is
-- Postgres's default grant for a new function plus explicit grants;
-- reproduced rather than tightened, because the point of a replica is
-- to behave like the original, not better than it.
DO $dp014_acl$
DECLARE r text;
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.redeem_order_atomic(text) TO PUBLIC';
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.redeem_order_atomic(text) TO %I', r);
    END IF;
  END LOOP;
END
$dp014_acl$;

GRANT ALL ON public.users TO anon, authenticated, service_role;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- VERIFICATION — read-only
-- ═════════════════════════════════════════════════════════════════════

-- A. The function matches the capture in every attribute that affects
--    behaviour under RLS and under concurrency.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid)             AS returns,
       p.provolatile::text                       AS volatility,
       p.proisstrict                             AS is_strict,
       p.prosecdef                               AS security_definer,
       pg_get_userbyid(p.proowner)               AS owner,
       CASE WHEN p.provolatile = 'v' AND NOT p.proisstrict
             AND NOT p.prosecdef AND pg_get_userbyid(p.proowner) = 'postgres'
            THEN 'PASS — matches capture'
            ELSE 'FAIL — diverges from production' END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname = 'redeem_order_atomic';

-- B. users matches the captured column shape exactly.
SELECT column_name, data_type, is_nullable, coalesce(column_default, '-') AS default_value
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- C. Both captured constraints are present, and no trigger was invented.
SELECT (SELECT count(*) FROM pg_constraint
         WHERE conrelid = 'public.users'::regclass AND contype IN ('p','u')) AS constraints,
       (SELECT count(*) FROM pg_trigger
         WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal) AS triggers,
       CASE WHEN (SELECT count(*) FROM pg_constraint
                   WHERE conrelid = 'public.users'::regclass AND contype IN ('p','u')) = 2
             AND (SELECT count(*) FROM pg_trigger
                   WHERE tgrelid = 'public.users'::regclass AND NOT tgisinternal) = 0
            THEN 'PASS' ELSE 'FAIL' END AS verdict;
