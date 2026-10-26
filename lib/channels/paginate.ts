/**
 * Walking a PostgREST table past its default page.
 *
 * PostgREST caps a response at roughly a thousand rows. An aggregate
 * built on a capped read is not slightly wrong, it is silently wrong in
 * the direction that flatters whoever reads it — fewer orders, a smaller
 * total, no sign that anything is missing. So every read behind the
 * Share panel walks pages until a short one arrives.
 *
 * Two things make that walk trustworthy, and both are the caller's
 * responsibility to supply:
 *
 *  1. DETERMINISTIC ORDERING. Without an ORDER BY on a unique column,
 *     PostgreSQL may return rows in a different order per request, so a
 *     row can land on two pages or on none. The totals then change
 *     between reads of unchanged data.
 *
 *  2. AN ADMITTED CAP. The walk cannot run forever, so it stops — and
 *     when it stops early it must SAY so. A floor presented as a total
 *     is worse than an admitted gap, because nobody checks a number
 *     that looks finished.
 *
 * Pure and injectable: `fetchPage` is whatever actually talks to the
 * database, so the walk itself can be tested without one.
 */

export type Page<T> =
  | { ok: true; rows: T[] }
  | { ok: false; missingTable: boolean; error: string };

export type WalkResult<T> = {
  rows: T[];
  missingTable: boolean;
  error: string | null;
  /** True when `maxPages` was exhausted: rows beyond it were NOT read. */
  truncated: boolean;
};

/**
 * Read pages of `pageSize` until a short page, an error, or the cap.
 *
 * `fetchPage` is called with an inclusive range, matching PostgREST's
 * own `.range(from, to)`.
 */
export async function walkPages<T>(
  fetchPage: (from: number, to: number) => Promise<Page<T>>,
  pageSize: number,
  maxPages: number,
): Promise<WalkResult<T>> {
  const rows: T[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const result = await fetchPage(from, from + pageSize - 1);

    if (!result.ok) {
      return {
        rows,
        missingTable: result.missingTable,
        error: result.missingTable ? null : result.error,
        truncated: false,
      };
    }

    rows.push(...result.rows);

    // A short page is the only proof there is nothing after it.
    if (result.rows.length < pageSize) {
      return { rows, missingTable: false, error: null, truncated: false };
    }
  }

  // Every page was full right up to the cap, so there is very likely
  // more. Report what we have AS incomplete.
  return { rows, missingTable: false, error: null, truncated: true };
}
