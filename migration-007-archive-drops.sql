-- ═════════════════════════════════════════════════════════════════════
-- DealsPro Studio: Archive-only drop cleanup
--
-- Adds a nullable `archived_at` timestamp to drop_items. Archiving is a
-- NON-DESTRUCTIVE soft-hide: it removes a drop from the default Studio
-- list and from all public/customer queries, while leaving the row — and
-- every related order, lead, consent record, analytics, payment, and
-- redemption record — fully intact.
--
-- Visibility contract:
--   * `is_active`   → customer/public visibility toggle (unchanged).
--   * `archived_at` → admin cleanup / default-list + public visibility.
--   * Archive ALWAYS wins over active: any row with archived_at IS NOT NULL
--     is excluded from public queries regardless of is_active.
--
-- DEPLOY ORDER (mandatory):
--   1. Apply THIS migration in the Supabase SQL Editor first.
--   2. Confirm you are on the correct Supabase project/environment.
--   3. Deploy the code second.
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run. Non-destructive.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE drop_items
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Partial index: the default Studio list and all public queries filter
-- `archived_at IS NULL`, so index the common (non-archived) path.
CREATE INDEX IF NOT EXISTS idx_drop_items_not_archived
  ON drop_items (archived_at)
  WHERE archived_at IS NULL;
