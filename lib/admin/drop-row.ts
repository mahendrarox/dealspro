/**
 * Pure drop_items row builders.
 *
 * These live OUTSIDE lib/admin/actions.ts on purpose: that module carries
 * the "use server" directive, under which every export must be an async
 * function. A synchronous helper cannot be exported from it (Next fails
 * the build with "Server Actions must be async functions"), which also
 * made the helper untestable in isolation.
 *
 * Keeping the row shaping here makes it importable by both the server
 * action and the edit-save round-trip regression in
 * scripts/test-datetime.js.
 */

import type { DropUpdateInput } from "./schemas";

/**
 * Build the drop_items row for an UPDATE from validated input.
 *
 * Strips the form-only `location_mode` discriminator before persisting —
 * it's a client/server validation hint, not a DB column.
 *
 * `start_time` / `end_time` pass through UNTOUCHED: this builder must
 * never reformat an instant. The round-trip regression asserts exactly
 * that.
 */
export function toDbUpdateRow(parsed: DropUpdateInput) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { location_mode, ...rest } = parsed;
  return {
    ...rest,
    image_url: rest.image_url || null,
  };
}
