-- ═════════════════════════════════════════════════════════════════════
-- DealsPro Studio: location capture for drop_items
--
-- Adds Google Places-sourced (or manually entered) location fields to
-- every drop. All fields are NULLABLE and additive: existing rows keep
-- their current data untouched.
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE drop_items
  ADD COLUMN IF NOT EXISTS address    text,
  ADD COLUMN IF NOT EXISTS latitude   double precision,
  ADD COLUMN IF NOT EXISTS longitude  double precision,
  ADD COLUMN IF NOT EXISTS place_id   text;

-- Composite lat/lng index — supports spatial queries later without
-- requiring PostGIS (out of scope for this migration).
CREATE INDEX IF NOT EXISTS idx_drop_items_lat_lng
  ON drop_items (latitude, longitude);

-- Unique-ish lookup by Google place_id. NOT enforced unique because two
-- drops at the same restaurant are legitimate.
CREATE INDEX IF NOT EXISTS idx_drop_items_place_id
  ON drop_items (place_id);
