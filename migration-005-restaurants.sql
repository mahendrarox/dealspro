-- ═════════════════════════════════════════════════════════════════════
-- DealsPro Studio: Partner Restaurants
--
-- Creates a `restaurants` table and adds a `restaurant_id` foreign key
-- to `drop_items`. Backfills restaurant rows from existing drops that
-- already have a Google Places `place_id`, then links those drops to
-- their newly-created restaurant rows.
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- Non-destructive: existing inline restaurant data on `drop_items`
-- is preserved; legacy drops without a `place_id` continue to work.
-- ═════════════════════════════════════════════════════════════════════

-- ─── restaurants table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  city        text NOT NULL,
  tags        text[] NOT NULL DEFAULT '{}',
  address     text NOT NULL,
  latitude    double precision NOT NULL,
  longitude   double precision NOT NULL,
  place_id    text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurants_place_id
  ON restaurants (place_id) WHERE place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurants_is_active
  ON restaurants (is_active);
CREATE INDEX IF NOT EXISTS idx_restaurants_name
  ON restaurants (name);

-- ─── updated_at trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_restaurants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restaurants_updated_at ON restaurants;
CREATE TRIGGER trg_restaurants_updated_at
BEFORE UPDATE ON restaurants
FOR EACH ROW EXECUTE FUNCTION update_restaurants_updated_at();

-- ─── drop_items.restaurant_id FK ────────────────────────────────────
ALTER TABLE drop_items
  ADD COLUMN IF NOT EXISTS restaurant_id uuid
    REFERENCES restaurants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drop_items_restaurant_id
  ON drop_items (restaurant_id);

-- ─── Backfill: one restaurant per distinct place_id ─────────────────
-- Best-effort city extraction from "..., City, ST 00000, USA" pattern.
-- After backfill, admin can edit cities manually in /admin/restaurants.
INSERT INTO restaurants (name, city, tags, address, latitude, longitude, place_id)
SELECT DISTINCT ON (d.place_id)
  d.restaurant_name,
  COALESCE(
    NULLIF(TRIM(SPLIT_PART(SPLIT_PART(d.address, ',', -3), ',', -1)), ''),
    'Unknown'
  ) AS city,
  '{}'::text[] AS tags,
  d.address,
  d.latitude,
  d.longitude,
  d.place_id
FROM drop_items d
WHERE d.place_id IS NOT NULL
  AND d.address IS NOT NULL
  AND d.latitude IS NOT NULL
  AND d.longitude IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM restaurants r WHERE r.place_id = d.place_id
  )
ORDER BY d.place_id, d.created_at DESC;

-- ─── Link existing drops to their backfilled restaurant rows ────────
UPDATE drop_items d
SET restaurant_id = r.id
FROM restaurants r
WHERE d.place_id IS NOT NULL
  AND d.place_id = r.place_id
  AND d.restaurant_id IS NULL;

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restaurants_public_read ON restaurants;
CREATE POLICY restaurants_public_read ON restaurants
  FOR SELECT TO anon
  USING (is_active = true);

-- No INSERT/UPDATE/DELETE policies — admin mutations go through
-- the service_role client, same pattern as drop_items.

-- ─── Verification (run manually after applying) ─────────────────────
-- SELECT id, name, city, place_id, is_active, created_at FROM restaurants ORDER BY name;
-- SELECT id, restaurant_name, restaurant_id FROM drop_items ORDER BY created_at DESC LIMIT 20;
