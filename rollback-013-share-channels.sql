-- ═════════════════════════════════════════════════════════════════════
-- ROLLBACK for migration-013-share-channels.sql
--
-- Run ONLY if the Studio sharing feature must be withdrawn after
-- migration-013 has been applied.
--
-- ─── WHAT THIS IS SAFE TO DO ────────────────────────────────────────
-- migration-013 is purely additive: three new tables, two new
-- functions, one trigger on one of the new tables. It altered no
-- existing column, constraint, index, policy, grant or row, and there
-- is deliberately NO foreign key from `orders.tag` into the registry.
--
-- So dropping these objects cannot cascade into `orders`, `drop_items`,
-- `restaurants`, `users` or anything else. `orders.tag` keeps its
-- values: they are plain text and were never owned by this schema.
--
-- ─── WHAT IS LOST ───────────────────────────────────────────────────
-- Every recorded copy, visit and checkout-session event, and the
-- channel registry itself. Those measurements cannot be reconstructed.
-- PAID ORDERS AND THEIR TAGS ARE NOT TOUCHED — per-channel order
-- counts and order value come from `orders` and survive this rollback
-- intact. Re-applying migration-013 afterwards restores reporting of
-- orders by tag immediately; only copies/visits/checkouts start again
-- from empty, and `first_event_at` correctly returns to NULL.
--
-- ─── ORDER ──────────────────────────────────────────────────────────
-- Roll the CODE back first (Vercel instant rollback), THEN run this.
-- The reverse order leaves the deployed code briefly reading tables
-- that no longer exist — which it survives, degrading to "not tracked",
-- but there is no reason to choose that.
-- ═════════════════════════════════════════════════════════════════════

BEGIN;

DROP TRIGGER  IF EXISTS share_channels_code_write_once  ON share_channels;
DROP TRIGGER  IF EXISTS update_share_channels_updated_at ON share_channels;

DROP FUNCTION IF EXISTS record_channel_event(text, text, text, text);
DROP FUNCTION IF EXISTS channel_tags_in_use();
DROP FUNCTION IF EXISTS share_channels_code_write_once();
DROP FUNCTION IF EXISTS public.share_channels_set_updated_at();

-- NOT dropped: update_updated_at_column(). migration-013 no longer uses
-- it — it owns share_channels_set_updated_at() instead — but
-- migration-002 created it and other tables' triggers still depend on
-- it, so it is none of this rollback's business.

DROP TABLE    IF EXISTS channel_events;
DROP TABLE    IF EXISTS channel_instrumentation;
DROP TABLE    IF EXISTS share_channels;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- VERIFICATION — read-only
-- ═════════════════════════════════════════════════════════════════════

-- A. All three tables are gone.
SELECT count(*) AS tables_remaining,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL — see names below' END AS verdict
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('share_channels', 'channel_events', 'channel_instrumentation');

-- B. All four of this feature's functions are gone, and
--    update_updated_at_column() — which belongs to migration-002 and is
--    still used by other tables' triggers — is NOT.
SELECT p.proname,
       CASE WHEN p.proname = 'update_updated_at_column'
            THEN 'EXPECTED — belongs to migration-002, still in use'
            ELSE 'FAIL — should have been dropped' END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname IN ('record_channel_event', 'channel_tags_in_use',
                    'share_channels_code_write_once',
                    'share_channels_set_updated_at',
                    'update_updated_at_column');

-- C. THE IMPORTANT ONE: orders is untouched and still carries its tags.
SELECT count(*)                                   AS orders_total,
       count(*) FILTER (WHERE tag IS NOT NULL)    AS orders_still_tagged,
       count(DISTINCT tag) FILTER (WHERE tag IS NOT NULL) AS distinct_tags,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name='orders'
                            AND column_name='tag')
            THEN 'PASS — orders.tag intact'
            ELSE 'FAIL — orders.tag was removed' END AS verdict
FROM orders;
