import { z } from "zod";

/**
 * Zod contracts for the restaurant intake flow.
 *
 * Two distinct shapes live here and they must not be confused:
 *
 *   1. `extractedDraftSchema` — what the LLM is allowed to return. EVERY
 *      field is nullable, because the model's only job is to report what
 *      the restaurant actually said. A null is the model telling us "not
 *      stated", which the server turns into a question. The model is
 *      never permitted to guess, and the schema gives it no field in
 *      which a guess about restaurant identity could even be expressed.
 *
 *   2. `intakeDraftSchema` — a COMPLETE draft, after the restaurant has
 *      answered the questions. This is what gets persisted and what the
 *      operator's review form is prefilled from.
 *
 * Time is always America/Chicago WALL CLOCK here (a plain date plus
 * HH:MM), never an instant. Conversion to a UTC ISO instant happens in
 * exactly one place — `toIso()` from `app/admin/drops/form-utils.ts`, the
 * same pinned-Central converter the Studio form uses. Keeping wall clock
 * and instant in separate layers is what stops a drop from drifting an
 * hour across a DST boundary.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Money: positive, at most 2 decimal places, bounded to a sane menu price. */
const moneySchema = z
  .number()
  .positive("must be greater than 0")
  .max(10000, "must be $10,000 or less")
  // `n * 100` must land on a whole number of cents. The epsilon absorbs
  // binary-float noise (12.99 * 100 is 1298.9999999999998) without
  // admitting a genuine sub-cent value like 12.999.
  .refine((n) => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
    message: "must have at most 2 decimal places",
  });

const spotsSchema = z
  .number()
  .int("must be a whole number")
  .positive("must be greater than 0")
  .max(1000, "must be 1000 or less");

const titleSchema = z.string().trim().min(3, "too short").max(120, "too long");
const dateSchema = z.string().regex(DATE_RE, "must be YYYY-MM-DD");
const timeSchema = z.string().regex(TIME_RE, "must be HH:MM (24-hour)");

// ═══════════════════════════════════════════════════════════════════════
// 1. LLM OUTPUT — strict, every field nullable, no extra keys
// ═══════════════════════════════════════════════════════════════════════

/**
 * The ONLY shape the model may return. `strictObject` rejects any extra
 * key outright, so a model that decides to volunteer a `restaurant_name`,
 * an `is_active`, an `image_url` or an instruction field fails validation
 * and the whole extraction is discarded (fail closed).
 *
 * Note what is absent and must stay absent: restaurant identity, image,
 * drop id, active/hero/priority flags. Those are not the model's to have
 * an opinion about.
 */
export const extractedDraftSchema = z.strictObject({
  /** Short customer-facing offer title, e.g. "Chicken Biryani Box". */
  title: titleSchema.nullable(),
  /** Price per spot in dollars. Null unless the restaurant stated it. */
  price: moneySchema.nullable(),
  /**
   * Regular/"normally" price. Null unless EXPLICITLY supplied — an
   * invented original price is a fake discount, which is why the prompt
   * and this comment both call it out.
   */
  original_price: moneySchema.nullable(),
  /** Number of portions available. */
  total_spots: spotsSchema.nullable(),
  /** Pickup date, America/Chicago wall clock. */
  pickup_date: dateSchema.nullable(),
  /** Pickup window start, America/Chicago wall clock, 24-hour. */
  pickup_start_time: timeSchema.nullable(),
  /** Pickup window end, America/Chicago wall clock, 24-hour. */
  pickup_end_time: timeSchema.nullable(),
});

export type ExtractedDraft = z.infer<typeof extractedDraftSchema>;

/** An all-null extraction — the fail-closed default. */
export const EMPTY_EXTRACTED_DRAFT: ExtractedDraft = {
  title: null,
  price: null,
  original_price: null,
  total_spots: null,
  pickup_date: null,
  pickup_start_time: null,
  pickup_end_time: null,
};

/**
 * JSON Schema handed to the model as a strict tool definition. Kept
 * adjacent to the zod schema above so the two cannot drift: the API
 * enforces this shape, and zod re-validates the result anyway because a
 * schema-valid payload can still be semantically wrong.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: ["string", "null"], description: "Short offer title, or null if not stated" },
    price: { type: ["number", "null"], description: "Price per portion in dollars, or null" },
    original_price: {
      type: ["number", "null"],
      description: "Regular price in dollars. Null unless the restaurant explicitly stated it.",
    },
    total_spots: { type: ["integer", "null"], description: "Number of portions, or null" },
    pickup_date: {
      type: ["string", "null"],
      description: "Pickup date as YYYY-MM-DD in America/Chicago, or null",
    },
    pickup_start_time: {
      type: ["string", "null"],
      description: "Pickup start as HH:MM 24-hour in America/Chicago, or null",
    },
    pickup_end_time: {
      type: ["string", "null"],
      description: "Pickup end as HH:MM 24-hour in America/Chicago, or null",
    },
  },
  required: [
    "title",
    "price",
    "original_price",
    "total_spots",
    "pickup_date",
    "pickup_start_time",
    "pickup_end_time",
  ],
  additionalProperties: false,
};

// ═══════════════════════════════════════════════════════════════════════
// 2. COMPLETE DRAFT — after the restaurant answers the questions
// ═══════════════════════════════════════════════════════════════════════

export const intakeDraftSchema = z.strictObject({
  title: titleSchema,
  price: moneySchema,
  original_price: moneySchema.nullable(),
  total_spots: spotsSchema,
  pickup_date: dateSchema,
  pickup_start_time: timeSchema,
  pickup_end_time: timeSchema,
});

export type IntakeDraft = z.infer<typeof intakeDraftSchema>;

/** Fields a submission cannot be without. `original_price` is NOT one. */
export const REQUIRED_DRAFT_FIELDS = [
  "title",
  "price",
  "total_spots",
  "pickup_date",
  "pickup_start_time",
  "pickup_end_time",
] as const;

export type RequiredDraftField = (typeof REQUIRED_DRAFT_FIELDS)[number];

/**
 * Which required facts the restaurant still has to supply. Derived
 * DETERMINISTICALLY from nulls — the model does not get to decide what
 * counts as missing, it only reports what it heard.
 */
export function missingRequiredFields(
  draft: Partial<ExtractedDraft> | null | undefined,
): RequiredDraftField[] {
  if (!draft) return [...REQUIRED_DRAFT_FIELDS];
  return REQUIRED_DRAFT_FIELDS.filter((f) => {
    const v = draft[f];
    return v === null || v === undefined || v === "";
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 3. SUBMISSION PAYLOAD — what the browser posts to the server action
// ═══════════════════════════════════════════════════════════════════════

/**
 * Note what the browser is NOT trusted to send: `restaurant_id` (it comes
 * from the verified token) and the drop `id` (generated server-side at
 * review time). `image_url` IS sent but is re-checked server-side against
 * this restaurant's own uploads and published photos — see
 * `assertImageBelongsToRestaurant` in ./images.
 */
export const submitPayloadSchema = z.strictObject({
  raw_message: z.string().trim().min(1, "message is required").max(4000),
  draft: intakeDraftSchema,
  image_url: z.string().url("must be a valid URL"),
  image_source: z.enum(["upload", "reuse"]),
  /**
   * Literal `true`. A checkbox left unticked is not an attestation, and
   * the DB CHECK constraint refuses the row as a second line of defence.
   */
  photo_attestation: z.literal(true, {
    message: "You must confirm the photo shows your own real food",
  }),
  /**
   * Signed receipt issued by the intake upload route, carrying the
   * provenance it read from the ORIGINAL bytes. Null for a reused photo
   * (there are no original bytes to read). Never a raw provenance
   * object: the browser must not be able to author its own audit trail.
   */
  upload_receipt: z.string().min(1).nullable().default(null),
  idempotency_key: z.string().trim().min(8, "too short").max(128),
  intake_session_id: z.string().trim().min(1).max(128).nullable().default(null),
});

export type SubmitPayload = z.infer<typeof submitPayloadSchema>;
