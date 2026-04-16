-- ═════════════════════════════════════════════════════════════════════
-- DealsPro Studio: additive ALTER for existing drop_items table
--
-- Apply via Supabase SQL Editor. Safe to re-run (IF NOT EXISTS on every
-- statement). Non-destructive: every existing row keeps its current
-- data. New columns are populated with sane defaults for existing rows
-- via the backfill block at the bottom.
--
-- This file exists because the original `migration-002-studio.sql`
-- used `CREATE TABLE IF NOT EXISTS`, which no-ops when the table
-- already exists — so the 7 admin/schedule columns never got added.
-- ═════════════════════════════════════════════════════════════════════

-- ─── Add missing columns ────────────────────────────────────────────
ALTER TABLE drop_items ADD COLUMN IF NOT EXISTS image_url  text;
ALTER TABLE drop_items ADD COLUMN IF NOT EXISTS start_time timestamptz;
ALTER TABLE drop_items ADD COLUMN IF NOT EXISTS end_time   timestamptz;
ALTER TABLE drop_items ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT false;
ALTER TABLE drop_items ADD COLUMN IF NOT EXISTS is_hero    boolean NOT NULL DEFAULT false;
ALTER TABLE drop_items ADD COLUMN IF NOT EXISTS priority   integer NOT NULL DEFAULT 0;
ALTER TABLE drop_items ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ─── Backfill existing rows ─────────────────────────────────────────
-- Give every existing row a reasonable time window so the ordering
-- logic works immediately. We pick "now" as start and "now + 30 days"
-- as end. Flag them active so the homepage keeps rendering them.
UPDATE drop_items
SET
  start_time = COALESCE(start_time, now()),
  end_time   = COALESCE(end_time,   now() + interval '30 days'),
  is_active  = COALESCE(is_active,  true)
WHERE start_time IS NULL OR end_time IS NULL;

-- ─── Post-backfill NOT NULL + CHECK constraints ─────────────────────
ALTER TABLE drop_items ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE drop_items ALTER COLUMN end_time   SET NOT NULL;

-- Time-order check (only add if missing).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'drop_items_time_order'
      AND conrelid = 'public.drop_items'::regclass
  ) THEN
    ALTER TABLE drop_items
      ADD CONSTRAINT drop_items_time_order
      CHECK (start_time < end_time);
  END IF;
END$$;

-- ─── updated_at trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_drop_items_updated_at ON drop_items;
CREATE TRIGGER update_drop_items_updated_at
BEFORE UPDATE ON drop_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ─── Indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drop_items_active        ON drop_items (is_active);
CREATE INDEX IF NOT EXISTS idx_drop_items_hero_priority ON drop_items (is_hero DESC, priority ASC);
CREATE INDEX IF NOT EXISTS idx_orders_drop_status       ON orders (drop_item_id, status);

-- ─── RLS: anon can SELECT only active rows ─────────────────────────
ALTER TABLE drop_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drop_items_public_read ON drop_items;
CREATE POLICY drop_items_public_read ON drop_items
  FOR SELECT TO anon
  USING (is_active = true);

-- ─── admin_logs (create if missing — Studio mutation log) ───────────
CREATE TABLE IF NOT EXISTS admin_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action       text NOT NULL,
  drop_id      text,
  changes      jsonb,
  admin_email  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_drop_created
  ON admin_logs (drop_id, created_at DESC);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
-- (no policies = deny-all for anon/authenticated; only service_role
-- can read/insert, append-only)

-- ─── Verification query (run manually after applying) ──────────────
-- SELECT id, title, start_time, end_time, is_active, is_hero, priority
-- FROM drop_items ORDER BY is_hero DESC, priority ASC, created_at DESC;
