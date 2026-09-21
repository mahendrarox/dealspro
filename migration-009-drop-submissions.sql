-- ═════════════════════════════════════════════════════════════════════
-- DealsPro: Restaurant Drop Intake — `drop_submissions`
--
-- Creates a NEW table that sits strictly UPSTREAM of `drop_items`. A
-- restaurant's conversational submission lands here and nowhere else;
-- no `drop_items` row exists until a DealsPro operator explicitly
-- publishes it through the existing authenticated Studio flow.
--
-- WHY A SEPARATE TABLE (and not `drop_items.is_active = false`):
--   * `is_active = false` already MEANS "expired" — `dbRowToDropItem()`
--     maps it to `status: "expired"`. A pending submission would be
--     indistinguishable from a finished or paused drop.
--   * Rows in `drop_items` are addressable by id on public surfaces
--     that do NOT filter on `is_active` / `archived_at`
--     (`getDropByIdForServer` → `/drop/[id]`, `/api/public/drops/[id]`;
--     `getAllSpotsInfo` → `/api/spots`, `/api/drops/spots`). A draft
--     parked there would be publicly reachable.
--   * There is nowhere on `drop_items` to keep the raw message, the
--     photo attestation, the intake-link audit trail, or the
--     idempotency key.
-- Keeping submissions in their own table makes draft invisibility a
-- property of the SCHEMA rather than of a read-path filter: no
-- customer-facing query in this repository reads this table.
--
-- This migration is ADDITIVE ONLY. It does not alter a single existing
-- column, constraint, index, policy or row on `drop_items`,
-- `restaurants`, `orders`, or anything else.
--
-- DEPLOY ORDER (mandatory):
--   1. Apply THIS migration in the Supabase SQL Editor.
--   2. Set INTAKE_JWT_SECRET (>= 32 chars, DIFFERENT from
--      ADMIN_JWT_SECRET) and ANTHROPIC_API_KEY in the environment.
--   3. Deploy the code.
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- Non-destructive.
-- ═════════════════════════════════════════════════════════════════════

-- ─── Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_submissions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy. RESTRICT (not CASCADE / SET NULL): a submission must never
  -- become orphaned or silently vanish — it is an audit record of what a
  -- partner sent us.
  restaurant_id           uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,

  -- Review lifecycle. Deliberately the SMALLEST set of states the review
  -- flow needs. This is NOT a drop lifecycle and shares no vocabulary
  -- with `drop_items.is_active` / `archived_at`.
  status                  text NOT NULL DEFAULT 'submitted'
                            CHECK (status IN ('submitted', 'published', 'rejected')),

  -- What the restaurant actually typed, kept verbatim for audit. The LLM
  -- interprets this text; it never writes to this table.
  raw_message             text NOT NULL,

  -- The structured draft AFTER server-side zod validation. Stored as the
  -- exact payload the review form is prefilled from.
  draft                   jsonb NOT NULL,

  -- Real food photo. `image_source` records how it was supplied:
  --   'upload' → normalized through lib/admin/images.ts into the
  --              `dealspro-images` bucket under intake/<restaurant_id>/
  --   'reuse'  → an image_url already attached to a PUBLISHED drop
  --              belonging to THIS SAME restaurant
  image_url               text NOT NULL,
  image_source            text NOT NULL CHECK (image_source IN ('upload', 'reuse')),

  -- Provenance signals captured BEFORE normalization strips metadata
  -- (original filename/size/mime, sha-256 of the original bytes, whether
  -- the file carried EXIF and any camera make/model). Advisory evidence
  -- for the human reviewer — not an AI-image detector.
  image_provenance        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The restaurant's explicit attestation that the photo shows its own
  -- real food/package. The CHECK makes an unattested submission
  -- physically unrepresentable — the guarantee lives in the schema, not
  -- only in application code.
  photo_attestation       boolean NOT NULL DEFAULT false,
  attested_at             timestamptz,
  CONSTRAINT drop_submissions_attested CHECK (photo_attestation = true),

  -- Idempotency: one logical submission = one row, even on a double-tap,
  -- a retry, or two concurrent requests. Scoped per restaurant so two
  -- partners can never collide.
  idempotency_key         text NOT NULL,

  -- Set only when an operator publishes. SET NULL so a hard delete of a
  -- drop row (the regression suite does this for its test data) never
  -- blocks or cascades into the submission audit trail.
  published_drop_id       text REFERENCES drop_items(id) ON DELETE SET NULL,

  -- Audit: identifies the intake link + browser session WITHOUT ever
  -- storing the raw signed token. `intake_token_jti` is the token's `jti`
  -- claim; `intake_session_id` is a per-visit client id. Neither can be
  -- replayed as a credential.
  intake_token_jti        text NOT NULL,
  intake_token_issued_at  timestamptz,
  intake_token_expires_at timestamptz,
  intake_session_id       text,

  reviewed_by             text,
  review_note             text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  reviewed_at             timestamptz
);

-- ─── Idempotency backstop ───────────────────────────────────────────
-- The unique index is the real guarantee; the server action's
-- 23505-catch turns a losing race into "return the row that won".
CREATE UNIQUE INDEX IF NOT EXISTS uq_drop_submissions_idempotency
  ON drop_submissions (restaurant_id, idempotency_key);

-- ─── Indexes for the Studio review queue ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drop_submissions_status_created
  ON drop_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drop_submissions_restaurant
  ON drop_submissions (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drop_submissions_published_drop
  ON drop_submissions (published_drop_id)
  WHERE published_drop_id IS NOT NULL;

-- ─── updated_at trigger (DB-level; never rely on app code) ──────────
CREATE OR REPLACE FUNCTION update_drop_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drop_submissions_updated_at ON drop_submissions;
CREATE TRIGGER trg_drop_submissions_updated_at
BEFORE UPDATE ON drop_submissions
FOR EACH ROW EXECUTE FUNCTION update_drop_submissions_updated_at();

-- ─── RLS: deny-all ──────────────────────────────────────────────────
-- Row Level Security is ENABLED and NO policy is created. In PostgreSQL
-- that means: anon and authenticated can do NOTHING — no SELECT, no
-- INSERT, no UPDATE, no DELETE. Browser code (which holds at most the
-- anon key) therefore cannot read or write this table under any
-- circumstance, including with a valid intake link.
--
-- Every legitimate read/write goes through the service_role client
-- (`lib/supabase-admin.ts`, marked server-only) AFTER either:
--   * `verifyIntakeToken()` — restaurant-scoped server actions, or
--   * `requireAdmin()`      — operator review/publish.
--
-- This deliberately mirrors `admin_logs` (migration-002-studio.sql),
-- which is also RLS-on/no-policies.
ALTER TABLE drop_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drop_submissions_public_read ON drop_submissions;
-- ^ defensive: guarantees a re-run cannot leave behind a permissive
--   policy added by hand between runs. No policy is created afterwards.

-- ─── Verification (run manually after applying) ─────────────────────
-- Expect rowsecurity = true and ZERO policy rows:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'drop_submissions';
--   SELECT * FROM pg_policies WHERE tablename = 'drop_submissions';
-- Expect the unique idempotency index:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'drop_submissions';
-- Confirm drop_items was NOT altered (column list unchanged):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'drop_items' ORDER BY ordinal_position;
