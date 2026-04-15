-- ═════════════════════════════════════════════════════════════════════
-- DealsPro Studio — internal admin schema
-- Apply via Supabase SQL Editor (same pattern as migration.sql at repo root).
-- Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

-- ─── drop_items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_items (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  restaurant_name text NOT NULL,
  image_url       text,
  price           numeric(10,2) NOT NULL CHECK (price >= 0),
  original_price  numeric(10,2) CHECK (original_price IS NULL OR original_price >= price),
  total_spots     integer NOT NULL CHECK (total_spots >= 0),
  start_time      timestamptz NOT NULL,
  end_time        timestamptz NOT NULL,
  is_active       boolean NOT NULL DEFAULT false,
  is_hero         boolean NOT NULL DEFAULT false,
  priority        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drop_items_time_order CHECK (start_time < end_time)
);

-- ─── updated_at trigger (DB-level; never rely on app code) ───────────
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

-- ─── indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drop_items_active        ON drop_items (is_active);
CREATE INDEX IF NOT EXISTS idx_drop_items_hero_priority ON drop_items (is_hero DESC, priority ASC);
-- idx_orders_drop_item_status already exists via migration.sql; keep an idempotent guard
CREATE INDEX IF NOT EXISTS idx_orders_drop_status       ON orders (drop_item_id, status);

-- ─── admin_logs (append-only) ────────────────────────────────────────
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

-- ─── RLS: drop_items ─────────────────────────────────────────────────
ALTER TABLE drop_items ENABLE ROW LEVEL SECURITY;

-- Public anon read: only active rows. Wrapped-auth pattern is unnecessary for
-- this policy because it's an anon-scoped boolean comparison.
DROP POLICY IF EXISTS drop_items_public_read ON drop_items;
CREATE POLICY drop_items_public_read ON drop_items
  FOR SELECT TO anon
  USING (is_active = true);

-- NOTE: no INSERT/UPDATE/DELETE policies. All admin mutations go through
-- the service_role client after server-side JWT verification. Service role
-- bypasses RLS by design; authenticated-role clients are intentionally denied.

-- ─── RLS: admin_logs (append-only, service_role only) ────────────────
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
-- No policies = deny-all for anon/authenticated. Only service_role can touch.
-- No UPDATE or DELETE policies anywhere = append-only.
