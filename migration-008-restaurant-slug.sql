-- ═════════════════════════════════════════════════════════════════════
-- DealsPro: Restaurant smart-URL slug (STEP 1 of 2 — add column)
--
-- Adds a nullable `slug` column to `restaurants`. The unique index and the
-- NOT NULL constraint are applied SEPARATELY in migration-008b, AFTER the
-- backfill script has populated every row — so this step is safe to apply
-- against a live table with zero downtime.
--
-- DEPLOY ORDER (mandatory):
--   1. Apply THIS migration (adds nullable column).
--   2. Run: npx tsx scripts/backfill-restaurant-slugs.ts
--      (uses the SAME slugify() the Studio create path uses).
--   3. Validate (queries below) — expect 0 NULLs and 0 duplicates.
--   4. Apply migration-008b (unique index + NOT NULL).
--   5. Deploy the code (resolver, /r/[slug] route, Studio slug display).
--
-- Apply via Supabase SQL Editor. Idempotent. Non-destructive.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS slug text;

-- ─── Validation (run manually AFTER the backfill script in step 2) ───
-- Expect 0 rows from both:
--   SELECT count(*) FROM restaurants WHERE slug IS NULL;
--   SELECT slug, count(*) FROM restaurants GROUP BY slug HAVING count(*) > 1;
