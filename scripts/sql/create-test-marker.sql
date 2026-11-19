-- ═════════════════════════════════════════════════════════════════════
-- ⚠  RUN THIS ONLY ON A DEDICATED TEST DATABASE.  ⚠
--
-- This creates the sentinel row that scripts/lib/test-env-guard.js reads
-- to decide whether the destructive regression suite may run.
--
-- RUNNING IT ON PRODUCTION WOULD DISARM THE SAFETY GUARD and allow a
-- suite that performs 54 deletes to run against real customer data.
-- There is no legitimate reason for this row to exist in production.
--
-- Deliberately NOT named migration-NNN: it is not part of the production
-- migration sequence and must never be applied as one.
-- ═════════════════════════════════════════════════════════════════════

-- Refuse on Supabase's production database name. Not a substitute for
-- care — the operator is the real control — but it stops the most likely
-- accident, a paste into the wrong SQL editor tab.
DO $marker_guard$
BEGIN
  IF current_database() = 'postgres' THEN
    RAISE EXCEPTION
      'REFUSING: this marks a database as safe to DESTROY. The database '
      'is named "postgres", which is what Supabase calls production. If '
      'this really is a dedicated test project, run the statements by hand.';
  END IF;
END
$marker_guard$;

BEGIN;

CREATE TABLE IF NOT EXISTS dealspro_test_marker (
  id              boolean PRIMARY KEY DEFAULT true,
  -- Must match the identity the guard derives from the connection URL:
  -- the Supabase project ref, or local:<host>:<port> for a disposable
  -- cluster. A mismatch refuses, so a marker copied between projects
  -- does not travel.
  target_identity text    NOT NULL,
  -- Only exactly false permits the suite. NULL, true, or the string
  -- 'false' all refuse.
  is_production   boolean NOT NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dealspro_test_marker_single_row CHECK (id),
  CONSTRAINT dealspro_test_marker_not_prod   CHECK (is_production = false)
);

-- EDIT target_identity before running: set it to this project's ref, or
-- to local:127.0.0.1:54321 for a disposable cluster.
INSERT INTO dealspro_test_marker (id, target_identity, is_production, note)
VALUES (true, 'REPLACE_WITH_TARGET_IDENTITY', false,
        'Destructive regression suite is permitted against this database.')
ON CONFLICT (id) DO NOTHING;

-- The guard only ever reads this table. Browser roles have no business
-- with it at all.
ALTER TABLE dealspro_test_marker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dealspro_test_marker FROM PUBLIC;

COMMIT;

-- Verification — read-only.
SELECT target_identity, is_production,
       CASE WHEN is_production = false AND target_identity <> 'REPLACE_WITH_TARGET_IDENTITY'
            THEN 'PASS — guard will accept this target'
            WHEN target_identity = 'REPLACE_WITH_TARGET_IDENTITY'
            THEN 'FAIL — set target_identity to this project''s real identity'
            ELSE 'FAIL' END AS verdict
FROM dealspro_test_marker;
