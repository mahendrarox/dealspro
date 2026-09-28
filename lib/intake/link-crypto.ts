import crypto from "crypto";

/**
 * Authenticated encryption for intake link codes.
 *
 * Server-only. Nothing in `app/**` that runs in the browser may import
 * this module, and the key never leaves this file — callers hand in a
 * plaintext code or an envelope and get the other back.
 *
 * WHY THIS EXISTS. The original design stored only `sha256(code)`, which
 * made a link genuinely unrecoverable: an operator who refreshed Studio
 * lost the ability to give the partner their own link again, and the only
 * remedy was Replace, which invalidates every other link that partner
 * holds. That is the right trade-off for a password and the wrong one
 * for a link an operator has to re-send.
 *
 * WHY THE HASH STAYS. Validation still goes through the unique index on
 * `code_hash` — a constant-shape indexed lookup on a value that cannot
 * be reversed. The ciphertext is a SEPARATE, admin-only path, so the
 * public resolution path is unchanged and gains no new capability. If
 * this key leaks, an attacker who ALSO has the database can read
 * outstanding codes; they could already mint their own with service-role
 * access, so the key is guarded but it is not the last line of defence.
 *
 * AES-256-GCM, not CBC or CTR: the codes are short and an attacker who
 * can write to the table could otherwise flip bits in a ciphertext and
 * have Studio hand an operator a URL pointing at a code of the
 * attacker's choosing. GCM's tag makes that a decryption failure.
 *
 * The AAD binds each ciphertext to its own row (id, restaurant and code
 * hash). Copying a ciphertext onto another row — the obvious move for
 * anyone trying to make restaurant A's link reveal restaurant B's code —
 * changes the AAD and fails the tag check.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;

/** Envelope format tag. Bump alongside `code_enc_version` if this changes. */
const ENVELOPE_PREFIX = "dp1";

/** Value stored in `intake_links.code_enc_version` for this format. */
export const ENVELOPE_VERSION = 1;

/** The one environment variable that holds the key. */
export const ENC_KEY_ENV = "INTAKE_LINK_ENC_KEY";

/**
 * Parse the key. Accepts base64, base64url or hex — whatever the
 * operator's key generator emitted — and insists on exactly 32 decoded
 * bytes so a truncated paste becomes a startup error rather than a
 * quietly weaker cipher.
 *
 * Deliberately NOT cached: the cost is microseconds next to a database
 * round trip, and caching would keep the key resident in module scope
 * for the life of the process for no benefit.
 */
function loadKey(): Buffer {
  const raw = process.env[ENC_KEY_ENV];
  if (!raw || raw.trim().length === 0) {
    throw new Error(`[intake/link-crypto] ${ENC_KEY_ENV} is not set`);
  }
  const value = raw.trim();

  const candidates: Buffer[] = [];
  if (/^[0-9a-fA-F]{64}$/.test(value)) candidates.push(Buffer.from(value, "hex"));
  candidates.push(Buffer.from(value, "base64"));
  candidates.push(Buffer.from(value, "base64url"));

  const key = candidates.find((b) => b.length === KEY_BYTES);
  if (!key) {
    throw new Error(
      `[intake/link-crypto] ${ENC_KEY_ENV} must decode to exactly ${KEY_BYTES} bytes ` +
        `(base64, base64url or hex)`,
    );
  }
  return key;
}

/**
 * Whether codes can be encrypted and revealed at all.
 *
 * Creating a link must NOT depend on this: an environment without the key
 * still mints working links, they simply behave like the hash-only links
 * that predate this feature. Failing link creation closed would take a
 * working feature away to protect a convenience.
 */
export function isLinkCryptoConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** The fields a ciphertext is bound to. All three are already in the row. */
export type LinkAadParts = {
  id: string;
  restaurantId: string;
  codeHash: string;
};

/**
 * Additional authenticated data: not secret, but authenticated. Any
 * mismatch between the envelope and the row it was read from is a
 * decryption failure rather than a wrong-but-plausible code.
 */
export function linkAad(parts: LinkAadParts): Buffer {
  return Buffer.from(
    `${ENVELOPE_PREFIX}|${parts.id}|${parts.restaurantId}|${parts.codeHash}`,
    "utf8",
  );
}

/**
 * Encrypt one code. Returns `dp1.<iv>.<ciphertext>.<tag>`, all base64url.
 *
 * Throws when the key is missing or malformed — callers decide whether
 * that is fatal. `createLink` treats it as "store the hash only".
 */
export function encryptCode(code: string, parts: LinkAadParts): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(linkAad(parts));
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt one envelope, or return null.
 *
 * Returns null — never throws, never logs the code, never distinguishes
 * "wrong key" from "tampered" from "malformed" to the caller. Studio
 * shows one message for all of them, because every one of them means the
 * same thing operationally: this link cannot be handed out again, replace
 * it.
 */
export function decryptCode(
  envelope: string | null | undefined,
  parts: LinkAadParts,
): string | null {
  if (!envelope) return null;

  const segments = envelope.split(".");
  if (segments.length !== 4) return null;
  const [prefix, ivB64, ctB64, tagB64] = segments;
  if (prefix !== ENVELOPE_PREFIX) return null;

  try {
    const key = loadKey();
    const iv = Buffer.from(ivB64, "base64url");
    const ciphertext = Buffer.from(ctB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
      return null;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(linkAad(parts));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    return plaintext.length > 0 ? plaintext : null;
  } catch {
    // Wrong key, tampered ciphertext, wrong row, malformed envelope.
    // No detail is logged: the inputs here are a key and a credential.
    return null;
  }
}

/**
 * Generate a key, for the setup instructions and for tests. Not called
 * by application code — an operator runs this shape of command once and
 * stores the result as a secret.
 */
export function generateEncKey(): string {
  return crypto.randomBytes(KEY_BYTES).toString("base64");
}
