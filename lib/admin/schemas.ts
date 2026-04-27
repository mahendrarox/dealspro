import { z } from "zod";

/** Drop ID: lowercase letters, digits, dashes only. Matches existing constants.ts IDs. */
export const dropIdSchema = z
  .string()
  .min(1, "id is required")
  .regex(/^[a-z0-9-]+$/, "id must be lowercase letters, digits, and dashes only");

// ─── Coercion helpers ──────────────────────────────────────────────────

const emptyToNull = (v: unknown) =>
  v === "" || v === undefined || v === null ? null : v;

const optionalCoordSchema = z.preprocess(
  emptyToNull,
  z.coerce
    .number()
    .refine((n) => Number.isFinite(n), { message: "must be a finite number" })
    .nullable(),
);

const requiredCoordSchema = z.preprocess(
  emptyToNull,
  z.coerce
    .number()
    .refine((n) => Number.isFinite(n), { message: "must be a finite number" }),
);

const optionalStringSchema = z.preprocess(
  emptyToNull,
  z.string().min(1).nullable(),
);

const locationModeSchema = z.enum(["autocomplete", "manual"]).default("autocomplete");

// ═══════════════════════════════════════════════════════════════════════
// RESTAURANT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(10, "max 10 tags")
  .default([]);

/**
 * Schema for creating a partner restaurant.
 *
 * Location: address + lat + lng are REQUIRED. `place_id` is optional —
 * present when the admin picked a Google suggestion, null when they
 * entered the address manually.
 */
export const restaurantCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  city: z.string().trim().min(1, "city is required").max(80),
  tags: tagsSchema,
  address: z.string().trim().min(1, "address is required"),
  latitude: requiredCoordSchema.refine((n) => n >= -90 && n <= 90, {
    message: "latitude must be between -90 and 90",
  }),
  longitude: requiredCoordSchema.refine((n) => n >= -180 && n <= 180, {
    message: "longitude must be between -180 and 180",
  }),
  place_id: optionalStringSchema.default(null),
  is_active: z.boolean().default(true),
});

/** Edit schema mirrors create — every field is required for an update. */
export const restaurantUpdateSchema = restaurantCreateSchema;

export type RestaurantCreateInput = z.infer<typeof restaurantCreateSchema>;
export type RestaurantUpdateInput = z.infer<typeof restaurantUpdateSchema>;

// ═══════════════════════════════════════════════════════════════════════
// DROP SCHEMAS
// ═══════════════════════════════════════════════════════════════════════

/**
 * CREATE schema — partner-restaurant era.
 *
 * Drops are now created by selecting a restaurant from the partner list.
 * The server action looks up the restaurant and denormalizes its
 * `restaurant_name`, `address`, `latitude`, `longitude`, `place_id`
 * onto the drop row before insert (so existing display code keeps
 * working unchanged).
 */
export const dropCreateSchema = z
  .object({
    id: dropIdSchema,
    title: z.string().min(1, "title is required"),
    restaurant_id: z.string().uuid("please select a partner restaurant"),
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
    is_active: z.boolean().default(true),
    is_hero: z.boolean().default(false),
    priority: z.number().int().default(0),
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
  });

/**
 * UPDATE schema — preserves the legacy inline-location shape.
 *
 * The edit form does NOT permit re-linking to a different restaurant
 * (a recreate is required for that), so this schema continues to accept
 * the inline location columns directly. Legacy drops without a
 * `restaurant_id` keep working unchanged.
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
    address: optionalStringSchema.default(null),
    latitude: optionalCoordSchema.default(null),
    longitude: optionalCoordSchema.default(null),
    place_id: optionalStringSchema.default(null),
    location_mode: locationModeSchema,
  })
  .refine((d) => d.original_price === null || d.original_price >= d.price, {
    message: "original_price must be >= price",
    path: ["original_price"],
  })
  .refine((d) => new Date(d.start_time).getTime() < new Date(d.end_time).getTime(), {
    message: "start_time must be before end_time",
    path: ["end_time"],
  })
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
