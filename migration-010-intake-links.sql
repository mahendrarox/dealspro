-- ═════════════════════════════════════════════════════════════════════
-- DealsPro: short private intake links — `intake_links`
--
-- Replaces the ~250-character signed JWT in /intake/<token> with a short
-- opaque code at /i/<code>. The code is 16 cryptographically random
-- bytes (128 bits) encoded as 22 base64url characters. It means nothing
-- on its own: all of its authority comes from a row in this table.
--
-- Codes are CASE SENSITIVE (base64url uses A-Z, a-z, 0-9, - and _).
--
-- WHY A TABLE AT ALL. The JWT carried its own payload, so it needed no
-- storage — but that is exactly why it could not be revoked, replaced,
-- or audited, and why it was long enough to be unusable over SMS or a
-- phone call. A short code cannot carry a payload, so the mapping lives
-- here, and that same row gives us revocation, replacement and per-link
-- usage history for free.
--
-- WHAT IS STORED. Only the SHA-256 of the code, never the code itself —
-- the same discipline as a password or an API key. Anyone who reads this
-- table (including a leaked backup) still cannot open a single link. The
-- consequence is deliberate: a link is displayed exactly once, at
-- creation. To give a restaurant a fresh link, an operator replaces it.
--
-- `code_prefix` (first 4 characters) is stored in the clear purely so an
-- operator can tell two links apart in Studio. Four characters of a
-- 30-symbol alphabet is ~20 bits — useless for guessing the remaining 12.
--
-- ADDITIVE ONLY. No existing table's columns, constraints, policies,
-- grants or rows are touched. `drop_submissions` needs no change: its
-- `intake_token_jti` column already means "which link produced this",
-- and for a short link it holds that link's UUID.
--
-- DEPLOY ORDER (mandatory):
--   1. Apply THIS migration.
--   2. Deploy the code.
--   3. Mint replacement links in Studio for any partner holding an old
--      JWT link (or let those expire on their own 14-day clock).
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

-- ─── Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intake_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy. CASCADE (unlike drop_submissions' RESTRICT): a link is a
  -- credential, not an audit record. If a partner is deleted, their
  -- outstanding credentials must die with them rather than linger.
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  -- SHA-256 (hex) of the normalized code. The code itself is never
  -- persisted anywhere, so this table cannot be turned back into a
  -- working link.
  code_hash      text NOT NULL,

  -- First 6 characters of the code, in the clear, so Studio can label
  -- links ("Xk7m2Q…"). 36 bits of a 128-bit code — useless for guessing
  -- the remaining 92.
  code_prefix    text NOT NULL,

  -- 14 days by default, set by the application at creation.
  expires_at     timestamptz NOT NULL,

  -- Revocation. Set both together; `revoked_at` is the authority.
  revoked_at     timestamptz,
  revoked_by     text,
  revoke_reason  text,

  -- Set on the OLD link when an operator replaces it, so the chain of
  -- links for a restaurant stays readable after the fact.
  replaced_by    uuid REFERENCES intake_links(id) ON DELETE SET NULL,

  created_by     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Usage signal for the operator: did the restaurant actually open it?
  -- Updated at most once every few minutes, never on a hot path.
  last_used_at   timestamptz,
  use_count      integer NOT NULL DEFAULT 0,

  CONSTRAINT intake_links_code_hash_len CHECK (char_length(code_hash) = 64),
  CONSTRAINT intake_links_prefix_len    CHECK (char_length(code_prefix) BETWEEN 1 AND 12),
  CONSTRAINT intake_links_revoke_pair   CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

-- ─── Lookup ─────────────────────────────────────────────────────────
-- The only read path is "resolve this code", so the hash must be unique
-- and indexed. UNIQUE also makes a collision a hard error rather than an
-- ambiguous match — at 78 bits it will never fire, but silence here
-- would be the wrong failure mode.
CREATE UNIQUE INDEX IF NOT EXISTS uq_intake_links_code_hash
  ON intake_links (code_hash);

CREATE INDEX IF NOT EXISTS idx_intake_links_restaurant
  ON intake_links (restaurant_id, created_at DESC);

-- Partial index over the links Studio lists most: still live.
CREATE INDEX IF NOT EXISTS idx_intake_links_active
  ON intake_links (restaurant_id, expires_at DESC)
  WHERE revoked_at IS NULL;

-- ─── RLS: deny-all ──────────────────────────────────────────────────
-- Identical posture to drop_submissions: RLS ON, zero policies. anon and
-- authenticated can do nothing — no SELECT, no INSERT, no UPDATE, no
-- DELETE — so browser code cannot enumerate links even holding a valid
-- one. Every access goes through the service-role client behind either
-- `resolveIntakeCredential()` or `requireAdmin()`.
ALTER TABLE intake_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_links_public_read ON intake_links;
-- ^ defensive only; no policy is created afterwards.


-- ─── Legacy JWT cutoff ──────────────────────────────────────────────
-- A signed JWT carries its own authority, so there is no row to revoke.
-- Without this table, "Revoke all" and "Replace" would close a partner's
-- short links while their old /intake/<token> link kept working — which
-- would make both buttons a lie.
--
-- One row per restaurant, holding the instant at which every legacy
-- token for that partner became invalid. The resolver refuses any token
-- whose `iat` is at or before the cutoff, and refuses an undateable
-- token outright once a cutoff exists.
--
-- This is a BRIDGE. Once INTAKE_ALLOW_LEGACY_JWT=false is set globally
-- and the last JWT has expired, this table and the legacy route can both
-- be dropped.
CREATE TABLE IF NOT EXISTS intake_legacy_cutoffs (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  cutoff_at     timestamptz NOT NULL DEFAULT now(),
  set_by        text NOT NULL,
  set_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE intake_legacy_cutoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intake_legacy_cutoffs_public_read ON intake_legacy_cutoffs;

-- ─── Privileges: RLS is not enough on its own ───────────────────────
-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on every new table in
-- `public` to anon and authenticated. For SELECT/INSERT/UPDATE/DELETE
-- that is harmless here, because RLS with zero policies denies every row.
--
-- TRUNCATE is NOT row-level. Postgres checks the TRUNCATE privilege and
-- ignores RLS entirely, so a client holding the anon key could have
-- emptied these tables outright. REFERENCES and TRIGGER are likewise
-- table-level and have no business being held by a browser role.
--
-- So revoke the table-level privileges explicitly. service_role is left
-- untouched: it is the server's identity and needs full access.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON intake_links           FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON intake_legacy_cutoffs  FROM anon, authenticated;

-- The SAME hole exists on drop_submissions from migration-009, which is
-- already live. Closing it here rather than leaving a known gap open
-- until a separate migration. This only REMOVES privileges from client
-- roles; it grants nothing and touches no row, column or policy.
DO $fix009$
BEGIN
  IF to_regclass('public.drop_submissions') IS NOT NULL THEN
    EXECUTE 'REVOKE TRUNCATE, REFERENCES, TRIGGER ON drop_submissions FROM anon, authenticated';
  END IF;
END
$fix009$;

-- ─── Verification (run manually after applying) ─────────────────────
-- Expect rowsecurity = true and ZERO policy rows:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'intake_links';
--   SELECT * FROM pg_policies WHERE tablename = 'intake_links';
-- Expect the unique hash index:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'intake_links';
-- Expect zero rows:
--   SELECT count(*) FROM intake_links;
-- Expect FALSE for every client role and every table-level privilege:
--   SELECT has_table_privilege('anon','public.intake_links','TRUNCATE');
--   SELECT has_table_privilege('authenticated','public.drop_submissions','TRUNCATE');
