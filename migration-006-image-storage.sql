-- ═════════════════════════════════════════════════════════════════════
-- DealsPro Studio: Image Storage
--
-- 1) Adds a `dealspro-images` Supabase Storage bucket (public read,
--    service-role writes) for the Studio image upload flow.
-- 2) Adds an optional `image_url` text column on `restaurants` so the
--    new <ImageUpload> component can persist a hero photo per partner.
--
-- Apply via Supabase SQL Editor before code merges. Idempotent: safe
-- to re-run. Non-destructive.
-- ═════════════════════════════════════════════════════════════════════

-- ─── Bucket ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dealspro-images',
  'dealspro-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read dealspro-images" ON storage.objects;
CREATE POLICY "Public read dealspro-images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'dealspro-images');

DROP POLICY IF EXISTS "Service role manage dealspro-images" ON storage.objects;
CREATE POLICY "Service role manage dealspro-images" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'dealspro-images')
  WITH CHECK (bucket_id = 'dealspro-images');

-- ─── restaurants.image_url ──────────────────────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS image_url text;
