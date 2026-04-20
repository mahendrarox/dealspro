import { z } from "zod";

/** Drop ID: lowercase letters, digits, dashes only. Matches existing constants.ts IDs. */
export const dropIdSchema = z
  .string()
  .min(1, "id is required")
  .regex(/^[a-z0-9-]+$/, "id must be lowercase letters, digits, and dashes only");

// ─── Location fields ───────────────────────────────────────────────────
//
// Four nullable columns on drop_items. `location_mode` is a form-only
// discriminator (not persisted) that tells the server which validation
// rules to apply:
//   - "autocomplete": Google Places selection — we MUST have a place_id
//   - "manual":       admin typed everything manually — place_id absent
//
// Coercion: the form posts `latitude`/`longitude` as strings (HTML
// `<input type="number">` yields a string). `z.coerce.number()` converts
// safely; empty strings become NaN which we filter to `null` via
// `preprocess` below.

const emptyToNull = (v: unknown) =>
  v === "" || v === undefined || v === null ? null : v;

const optionalCoordSchema = z.preprocess(
  emptyToNull,
  z.coerce
    .number()
    .refine((n) => Number.isFinite(n), { message: "must be a finite number" })
    .nullable(),
);

const optionalStringSchema = z.preprocess(
  emptyToNull,
  z.string().min(1).nullable(),
);

const locationModeSchema = z.enum(["autocomplete", "manual"]).default("autocomplete");

const baseLocationShape = {
  address: optionalStringSchema.default(null),
  latitude: optionalCoordSchema.default(null),
  longitude: optionalCoordSchema.default(null),
  place_id: optionalStringSchema.default(null),
  location_mode: locationModeSchema,
};

/**
 * Schema for creating a drop.
 *
 * Money: decimal dollars (matches lib/constants.ts and orders.price_paid).
 * Times: ISO-8601 strings with timezone.
 * Location: REQUIRED on create — address + lat + lng; plus place_id when
 *           location_mode === "autocomplete".
 */
export const dropCreateSchema = z
  .object({
    id: dropIdSchema,
    title: z.string().min(1, "title is required"),
    restaurant_name: z.string().min(1, "restaurant_name is required"),
    image_url: z
      .string()
      .url("must be a valid URL")
      .nullable()
      .or(z.literal("").transform(() => null)),
    price: z.number().positive("price must be > 0"),
    original_price: z.number().positive("original_price must be > 0").nullable(),
    total_spots: z.number().int().positive("total_spots must be a positive integer"),
    start_time: z.string().datetime({ message: "start_time must be an ISO-8601 datetime" }),
    end_time: z.string().datetime({ message: "end_time must be an ISO-8601 datetime" }),
    is_active: z.boolean().default(false),
    is_hero: z.boolean().default(false),
    priority: z.number().int().default(0),
    ...baseLocationShape,
  })
  .refine((d) => d.original_price === null || d.original_price >= d.price, {
    message: "original_price must be >= price",
    path: ["original_price"],
  })
  .refine((d) => new Date(d.start_time).getTime() < new Date(d.end_time).getTime(), {
    message: "start_time must be before end_time",
    path: ["end_time"],
  })
  .refine((d) => new Date(d.end_time).getTime() > Date.now(), {
    message: "end_time must be in the future",
    path: ["end_time"],
  })
  // CREATE: address + lat + lng are required
  .refine(
    (d) =>
      d.address !== null &&
      d.latitude !== null &&
      d.longitude !== null,
    {
      message: "Please select a suggestion from the list or switch to manual mode",
      path: ["address"],
    },
  )
  // CREATE + autocomplete: place_id is required
  .refine(
    (d) => d.location_mode !== "autocomplete" || d.place_id !== null,
    {
      message: "Please select a suggestion from the list or switch to manual mode",
      path: ["place_id"],
    },
  );

/**
 * Update schema: same fields as create except id (read-only after creation).
 *
 * EDIT location rules:
 *   - zero location fields allowed (legacy drops stay valid)
 *   - if ANY of (address, latitude, longitude) provided, ALL THREE required
 */
export const dropUpdateSchema = z
  .object({
    title: z.string().min(1, "title is required"),
    restaurant_name: z.string().min(1, "restaurant_name is required"),
    image_url: z
      .string()
      .url("must be a valid URL")
      .nullable()
      .or(z.literal("").transform(() => null)),
    price: z.number().positive("price must be > 0"),
    original_price: z.number().positive("original_price must be > 0").nullable(),
    total_spots: z.number().int().positive("total_spots must be a positive integer"),
    start_time: z.string().datetime({ message: "start_time must be an ISO-8601 datetime" }),
    end_time: z.string().datetime({ message: "end_time must be an ISO-8601 datetime" }),
    is_active: z.boolean(),
    is_hero: z.boolean(),
    priority: z.number().int(),
    ...baseLocationShape,
  })
  .refine((d) => d.original_price === null || d.original_price >= d.price, {
    message: "original_price must be >= price",
    path: ["original_price"],
  })
  .refine((d) => new Date(d.start_time).getTime() < new Date(d.end_time).getTime(), {
    message: "start_time must be before end_time",
    path: ["end_time"],
  })
  // EDIT: partial location not allowed — all-or-nothing
  .refine(
    (d) => {
      const provided = [d.address, d.latitude, d.longitude].filter((v) => v !== null).length;
      return provided === 0 || provided === 3;
    },
    {
      message: "Please enter complete location details",
      path: ["address"],
    },
  );

export type DropCreateInput = z.infer<typeof dropCreateSchema>;
export type DropUpdateInput = z.infer<typeof dropUpdateSchema>;
