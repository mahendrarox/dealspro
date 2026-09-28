-- ═════════════════════════════════════════════════════════════════════
-- DealsPro: retrievable intake links — `intake_links` ciphertext columns
--
-- Lets an authenticated Studio admin copy or open an existing ACTIVE
-- intake link after a refresh, instead of being forced to Replace (which
-- invalidates every other link that partner holds) just to re-send the
-- same URL.
--
-- WHAT CHANGES. Two nullable columns on `intake_links`. Nothing else:
-- no existing column, constraint, index, policy, grant or row is
-- altered, and no other table is touched.
--
-- WHY NOT JUST STORE THE CODE. A plaintext column would make the table a
-- bearer-credential store — one leaked backup and every outstanding link
-- is open. The code is encrypted with AES-256-GCM under a dedicated
-- server-only secret (INTAKE_LINK_ENC_KEY) that is NOT in the database,
-- so a dump alone still opens nothing.
--
-- WHY THE HASH STAYS. Validation is unchanged: /i/<code> still resolves
-- through the unique index on `code_hash`. The ciphertext is a separate,
-- admin-only retrieval path. The public path gains no new capability.
--
-- The GCM tag is computed over additional authenticated data built from
-- (id, restaurant_id, code_hash), so a ciphertext copied onto a different
-- row fails to decrypt. That is what stops "make restaurant A's link
-- reveal restaurant B's code" at the crypto layer, underneath the
-- restaurant guard the application already applies.
--
-- BACKWARD COMPATIBILITY. Existing rows keep `code_encrypted = NULL` and
-- go on working exactly as before, until their own expiry or a deliberate
-- revocation. Studio labels them and offers a one-time Replace, behind an
-- explicit confirmation. Nothing is replaced automatically.
--
-- FORWARD COMPATIBILITY. The application tolerates these columns being
-- absent (it retries its SELECT without them), so the code may be
-- deployed before or after this migration.
--
-- DEPLOY ORDER:
--   1. Set INTAKE_LINK_ENC_KEY in the server environment
--      (32 random bytes, base64 — see below). Never commit it.
--   2. Apply THIS migration.
--   3. Deploy the code.
--   Links minted before step 1 or 2 stay hash-only and copyable only
--   after a deliberate Replace.
--
--   Generate the key with:
--     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
--
-- Apply via Supabase SQL Editor. Idempotent: safe to re-run.
-- ═════════════════════════════════════════════════════════════════════

-- ─── Columns ────────────────────────────────────────────────────────
DO $dp011$
BEGIN
  IF to_regclass('public.intake_links') IS NULL THEN
    RAISE EXCEPTION
      'intake_links does not exist — apply migration-010-intake-links.sql first';
  END IF;
END
$dp011$;

-- AES-256-GCM envelope: 'dp1.<iv>.<ciphertext>.<tag>', each part
-- base64url. NULL means this link predates the feature (or was minted
-- without the key configured) and cannot be re-shown.
ALTER TABLE intake_links
  ADD COLUMN IF NOT EXISTS code_encrypted text;

-- Envelope format version, so a future key rotation or format change can
-- be rolled out row by row rather than all at once.
ALTER TABLE intake_links
  ADD COLUMN IF NOT EXISTS code_enc_version smallint;

COMMENT ON COLUMN intake_links.code_encrypted IS
  'AES-256-GCM envelope of the link code, keyed by INTAKE_LINK_ENC_KEY '
  '(NOT stored in the database). AAD binds it to (id, restaurant_id, '
  'code_hash). NULL = hash-only legacy row, not retrievable.';

COMMENT ON COLUMN intake_links.code_enc_version IS
  'Envelope format version for code_encrypted. 1 = dp1 (AES-256-GCM).';

-- ─── Both columns move together ─────────────────────────────────────
-- A ciphertext with no version, or a version with no ciphertext, would
-- mean the writer half-failed. Make that unrepresentable rather than
-- something the application has to defend against on every read.
DO $dp011_chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.intake_links'::regclass
      AND conname = 'intake_links_cipher_pair'
  ) THEN
    ALTER TABLE intake_links
      ADD CONSTRAINT intake_links_cipher_pair CHECK (
        (code_encrypted IS NULL AND code_enc_version IS NULL)
        OR (code_encrypted IS NOT NULL AND code_enc_version IS NOT NULL)
      );
  END IF;
END
$dp011_chk$;

-- Reject anything that is not the envelope shape this release writes.
-- Cheap insurance against a future caller storing a raw code here by
-- mistake — a 22-character base64url code does not match.
DO $dp011_fmt$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.intake_links'::regclass
      AND conname = 'intake_links_cipher_format'
  ) THEN
    ALTER TABLE intake_links
      ADD CONSTRAINT intake_links_cipher_format CHECK (
        code_encrypted IS NULL
        OR code_encrypted ~ '^dp1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
      );
  END IF;
END
$dp011_fmt$;

-- ─── Privileges: the new columns inherit nothing dangerous ──────────
-- RLS on `intake_links` is already ON with zero policies, so anon and
-- authenticated can read no row and therefore no column. Re-assert the
-- table-level privileges migration-010 revoked, because a column added
-- later is a common moment for a grant to creep back in.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON intake_links FROM anon, authenticated;

-- ─── Verification (run manually after applying) ─────────────────────
-- Expect both columns, nullable, no default:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='intake_links'
--     AND column_name IN ('code_encrypted','code_enc_version');
--
-- Expect both CHECK constraints:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid='public.intake_links'::regclass
--     AND conname IN ('intake_links_cipher_pair','intake_links_cipher_format');
--
-- Expect every pre-existing row to be untouched and still resolvable
-- (NULL ciphertext is the legacy state, not an error):
--   SELECT count(*) AS legacy_rows FROM intake_links WHERE code_encrypted IS NULL;
--
-- Expect FALSE for both client roles:
--   SELECT has_table_privilege('anon','public.intake_links','TRUNCATE');
--   SELECT has_table_privilege('authenticated','public.intake_links','TRUNCATE');
