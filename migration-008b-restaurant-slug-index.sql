-- ═════════════════════════════════════════════════════════════════════
-- DealsPro: Restaurant smart-URL slug (STEP 2 of 2 — enforce uniqueness)
--
-- Apply ONLY after:
--   1. migration-008 has been applied (slug column exists), AND
--   2. scripts/backfill-restaurant-slugs.ts has populated every row, AND
--   3. the validation queries show 0 NULLs and 0 duplicate slugs.
--
-- Applying before backfill completes would fail the SET NOT NULL (existing
-- rows would still have NULL slug). The unique index is the runtime
-- backstop for the create path's collision retry.
--
-- Apply via Supabase SQL Editor. Idempotent.
-- ═════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurants_slug ON restaurants (slug);

ALTER TABLE restaurants ALTER COLUMN slug SET NOT NULL;
