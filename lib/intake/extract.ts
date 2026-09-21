import { centralDateString } from "@/lib/drops/helpers";
import { toIso } from "@/app/admin/drops/form-utils";
import { validatePickupWindow } from "@/lib/admin/pickup-window";
import {
  EMPTY_EXTRACTED_DRAFT,
  extractedDraftSchema,
  missingRequiredFields,
  type ExtractedDraft,
  type RequiredDraftField,
} from "./schemas";
import { runStructuredExtraction } from "./provider";

/**
 * Language → candidate fields. The only place the model's output crosses
 * into the rest of the system, and it crosses through zod.
 *
 * Fail-closed contract: if the provider is missing, errors, answers in
 * prose, or returns anything that does not validate, the ENTIRE
 * extraction is discarded. Nothing partial is kept. The flow still works
 * — the restaurant is simply asked every required question — because a
 * degraded path that invents values is worse than one that asks.
 */

export type ExtractionFailure =
  | "unavailable"
  | "no_tool_call"
  | "provider_error"
  | "invalid_output";

export type ExtractionResult =
  | { ok: true; draft: ExtractedDraft; missing: RequiredDraftField[] }
  | {
      ok: false;
      reason: ExtractionFailure;
      /** Every required field, so the caller can ask for all of them. */
      missing: RequiredDraftField[];
      issues?: string[];
    };

/** `YYYY-MM-DD` for "now" in America/Chicago — the model's date anchor. */
export function todayCentral(now: Date = new Date()): string {
  return centralDateString(now);
}

export async function extractDropFields(
  message: string,
  now: Date = new Date(),
): Promise<ExtractionResult> {
  const allMissing = missingRequiredFields(null);

  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return { ok: false, reason: "invalid_output", missing: allMissing, issues: ["empty message"] };
  }

  const anchor = todayCentral(now);
  const result = await runStructuredExtraction(trimmed, anchor);
  if (!result.ok) {
    return { ok: false, reason: result.reason, missing: allMissing };
  }

  // Validate the model's output. `strictObject` means an extra key — a
  // model volunteering `restaurant_name`, `is_active`, or an instruction
  // field — fails the whole payload rather than being quietly dropped.
  const parsed = extractedDraftSchema.safeParse(result.raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    console.warn("[intake/extract] discarded invalid model output:", issues.join("; "));
    return { ok: false, reason: "invalid_output", missing: allMissing, issues };
  }

  // Deterministic guard rails on top of schema validity. Each one NULLS a
  // suspect value so it becomes a question — it never repairs or
  // substitutes one.
  const draft = applyGuardRails(parsed.data, anchor);

  return { ok: true, draft, missing: missingRequiredFields(draft) };
}

/**
 * Post-validation sanity pass. A schema-valid extraction can still be
 * semantically wrong (a pickup window running backwards, a date resolved
 * into the past, a discount that isn't one). Nulling the offending field
 * turns it into a tappable question, which is the only safe repair.
 */
function applyGuardRails(draft: ExtractedDraft, anchorDate: string): ExtractedDraft {
  const next: ExtractedDraft = { ...EMPTY_EXTRACTED_DRAFT, ...draft };

  // A date the model resolved into the past ("Friday" pointing backwards)
  // is dropped rather than trusted.
  if (next.pickup_date && next.pickup_date < anchorDate) {
    next.pickup_date = null;
  }

  // Original price must be a real saving. An original_price at or below
  // price is not a discount — and `dropCreateSchema` would reject it
  // downstream anyway.
  if (next.original_price !== null && next.price !== null && next.original_price <= next.price) {
    next.original_price = null;
  }
  // An original price with no price to compare against is meaningless.
  if (next.original_price !== null && next.price === null) {
    next.original_price = null;
  }

  // Run the SHARED pickup-window rule on the extracted window. If it
  // fails (end before start, or a window over 12h), drop the end time and
  // ask. `validatePickupWindow` stays the single authority — this does
  // not reimplement it.
  if (next.pickup_date && next.pickup_start_time && next.pickup_end_time) {
    const startIso = toIso(`${next.pickup_date}T${next.pickup_start_time}`);
    const endIso = toIso(`${next.pickup_date}T${next.pickup_end_time}`);
    if (!validatePickupWindow(startIso, endIso).ok) {
      next.pickup_end_time = null;
    }
  }

  return next;
}
