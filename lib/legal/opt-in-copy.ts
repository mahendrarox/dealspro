/**
 * DealsPro opt-in / SMS consent copy — single source of truth.
 *
 * Used by BOTH the live homepage opt-in form (`components/Homepage.tsx`) and
 * the Opt-In Policy page (`app/opt-in/page.tsx`) so the consent language can
 * never drift between what the user agrees to and what the policy documents.
 *
 * Copy/compliance only — no logic lives here.
 */

export const DEALSPRO_OPT_IN_TITLE = "Get DealsPro Drop Alerts";

export const DEALSPRO_OPT_IN_SUBTITLE =
  "Local deals and limited drops. No app needed.";

/** Short label rendered next to the checkbox. */
export const DEALSPRO_SMS_OPT_IN_SHORT_TEXT =
  "I agree to receive DealsPro marketing text alerts.";

/**
 * Full TCPA/CTIA disclosure. Canonical, plain-text form — the homepage
 * renders this with `Terms` and `Privacy Policy` turned into links via
 * `splitDisclosureForLinks()` below, keeping the visible text identical.
 */
export const DEALSPRO_SMS_OPT_IN_DISCLOSURE =
  "Recurring automated marketing text messages from DealsPro about local deals and drops from participating businesses, at the number provided. Consent is not a condition of purchase. Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel, HELP for help. See Terms and Privacy Policy.";

export const DEALSPRO_OPT_IN_FOOTER = "Free to join. Reply STOP anytime.";

export const DEALSPRO_TERMS_PATH = "/terms";
export const DEALSPRO_PRIVACY_PATH = "/privacy";

/** Exact link-label tokens (kept in sync with the disclosure text). */
export const DEALSPRO_TERMS_LABEL = "Terms";
export const DEALSPRO_PRIVACY_LABEL = "Privacy Policy";

/**
 * Split the canonical disclosure into the segments needed to render
 * `Terms` and `Privacy Policy` as two separate links while leaving `and`
 * and all surrounding copy as plain text. The source of truth stays the
 * single `DEALSPRO_SMS_OPT_IN_DISCLOSURE` string — this only derives the
 * boundaries, so the rendered visible text is exactly equivalent.
 *
 * Returns:
 *   pre     — everything up to (and including) "See "
 *   between — " and " (plain text between the two links)
 *   post    — trailing text after "Privacy Policy" (e.g. ".")
 */
export function splitDisclosureForLinks(): {
  pre: string;
  between: string;
  post: string;
} {
  const text = DEALSPRO_SMS_OPT_IN_DISCLOSURE;
  const linkPhrase = `${DEALSPRO_TERMS_LABEL} and ${DEALSPRO_PRIVACY_LABEL}`;
  const idx = text.indexOf(linkPhrase);
  // Defensive fallback: if the phrase ever changes, render the whole thing
  // as plain text rather than crash.
  if (idx === -1) {
    return { pre: text, between: "", post: "" };
  }
  return {
    pre: text.slice(0, idx), // "...See "
    between: ` and `,
    post: text.slice(idx + linkPhrase.length), // "."
  };
}
