import { z } from "zod";

/** Drop ID: lowercase letters, digits, dashes only. Matches existing constants.ts IDs. */
export const dropIdSchema = z
  .string()
  .min(1, "id is required")
  .regex(/^[a-z0-9-]+$/, "id must be lowercase letters, digits, and dashes only");

/**
 * Schema for creating a drop.
 *
 * Money: decimal dollars (matches lib/constants.ts and orders.price_paid).
 * Times: ISO-8601 strings with timezone.
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

/** Update schema: same fields as create except id (read-only after creation). */
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
  })
  .refine((d) => d.original_price === null || d.original_price >= d.price, {
    message: "original_price must be >= price",
    path: ["original_price"],
  })
  .refine((d) => new Date(d.start_time).getTime() < new Date(d.end_time).getTime(), {
    message: "start_time must be before end_time",
    path: ["end_time"],
  });

export type DropCreateInput = z.infer<typeof dropCreateSchema>;
export type DropUpdateInput = z.infer<typeof dropUpdateSchema>;
