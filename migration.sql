-- DealsPro Multi-Drop Migration
-- Run this in Supabase SQL Editor

-- 1. Add new columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS drop_item_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS redemption_status text DEFAULT 'pending';

-- 2. Backfill existing rows
UPDATE orders SET drop_item_id = drop_id WHERE drop_item_id IS NULL;
UPDATE orders SET redemption_status = CASE
  WHEN status = 'redeemed' THEN 'redeemed'
  ELSE 'pending'
END WHERE redemption_status = 'pending' OR redemption_status IS NULL;
UPDATE orders SET status = 'paid' WHERE status = 'redeemed';

-- 3. Add constraints and indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_phone_drop_item
  ON orders (phone, drop_item_id) WHERE phone IS NOT NULL;

-- stripe_session_id uniqueness (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_stripe_session') THEN
    CREATE UNIQUE INDEX uq_stripe_session ON orders (stripe_session_id);
  END IF;
END $$;

-- qr_token uniqueness (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_qr_token') THEN
    CREATE UNIQUE INDEX uq_qr_token ON orders (qr_token);
  END IF;
END $$;

-- Fast spot computation index
CREATE INDEX IF NOT EXISTS idx_orders_drop_item_status
  ON orders (drop_item_id, status);
