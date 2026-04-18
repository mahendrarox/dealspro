-- ═════════════════════════════════════════════════════════════════════
-- DealsPro Studio: enforce single-hero invariant (atomic + DB-level)
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

-- ─── Cleanup safety net: ensure at most one hero before adding the index ──
-- (Only un-flags rows if there are 2+ heroes; single hero stays.)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY priority ASC, created_at DESC) AS rn
  FROM drop_items
  WHERE is_hero = true
)
UPDATE drop_items
SET is_hero = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ─── Partial unique index: only one row may have is_hero = true ───────────
-- Uses a constant TRUE expression scoped to the WHERE clause so the unique
-- key is shared by every is_hero=true row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_hero
  ON drop_items ((true))
  WHERE is_hero = true;

-- ─── RPC: atomic single-hero swap ─────────────────────────────────────────
-- Step 1 unflags the current hero (if any).
-- Step 2 flags the target row.
-- Both run in a single transaction. SECURITY DEFINER so the service-role
-- and the authenticated admin can both invoke it without RLS interference.
CREATE OR REPLACE FUNCTION set_hero_drop(target_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE drop_items
  SET is_hero = false
  WHERE is_hero = true
    AND id <> target_id;

  UPDATE drop_items
  SET is_hero = true
  WHERE id = target_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_hero_drop: drop % does not exist', target_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Lock down execution: only authenticated callers and service_role can run it.
REVOKE ALL ON FUNCTION set_hero_drop(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_hero_drop(text) TO authenticated, service_role;

-- ─── Optional verification (manual) ──────────────────────────────────────
-- SELECT id, is_hero, priority FROM drop_items WHERE is_hero = true;
-- SELECT set_hero_drop('drop-biryani-apr07');
