/**
 * Values shared by the sharing server actions and the Share panel.
 *
 * These live outside `lib/admin/channels.ts` for the same reason
 * `lib/admin/drop-row.ts` exists: that module carries `"use server"`,
 * under which every export must be an async function. A plain constant
 * cannot be exported from it — Next fails the build with "Only async
 * functions are allowed to be exported in a 'use server' file".
 */

/** Shown when migration-013 has not been applied. */
export const CHANNELS_MIGRATION_REQUIRED =
  "Sharing is not available yet — apply migration-013-share-channels.sql.";

/** Rows PostgREST returns in one page; pagination walks past it. */
export const PAGE_SIZE = 1000;

/** Hard stop so a pathological dataset cannot spin forever. */
export const MAX_PAGES = 200;
