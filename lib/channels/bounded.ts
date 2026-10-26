/**
 * Bounding how long a measurement may hold up the thing it measures.
 *
 * Catching a database error does NOT bound latency: a write that hangs
 * for thirty seconds never throws, and the caller waits all thirty. The
 * only thing that bounds it is abandoning the wait, which is what this
 * does — an AbortController the caller can hand to the query, plus a
 * race that resolves when the deadline passes whether or not the query
 * ever answers.
 *
 * Abandoning the wait is not abandoning the write. The statement may
 * still land server-side after we stop listening, and that is fine:
 * every event insert is idempotent under its dedupe key, so a late
 * success is a correct row and a retry of it is a no-op.
 */

/** How long a single event write may hold a request. */
export const EVENT_WRITE_TIMEOUT_MS = 1500;

export type BoundedOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "timeout" }
  | { status: "error"; error: unknown };

/**
 * Run `work` with a deadline.
 *
 * `work` receives an AbortSignal and should pass it to whatever it calls
 * so the underlying request is actually cancelled rather than merely
 * ignored. Resolves — never rejects — so no caller can be broken by a
 * measurement.
 *
 * The timer is always cleared, including on the slow path, so this
 * cannot keep a serverless invocation alive past its own work.
 */
export async function bounded<T>(
  // PromiseLike, not Promise: a PostgREST query builder is a thenable
  // that only issues its request when awaited, which is exactly the
  // shape we want — nothing is sent until we are ready to time it.
  work: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs: number = EVENT_WRITE_TIMEOUT_MS,
  timerFns: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  } = { setTimeout, clearTimeout },
): Promise<BoundedOutcome<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const deadline = new Promise<BoundedOutcome<T>>((resolve) => {
    timer = timerFns.setTimeout(() => {
      // Cancel the in-flight request, then stop waiting for it.
      try {
        controller.abort();
      } catch {
        /* An AbortController that refuses to abort still must not throw. */
      }
      resolve({ status: "timeout" });
    }, timeoutMs);
  });

  // `work` is invoked inside the try so a SYNCHRONOUS throw — a bad
  // argument, a client that blows up before issuing the request — is an
  // outcome like any other rather than an exception at the call site.
  // Without this the whole guarantee has a hole in it: the one failure
  // mode that bypasses the deadline is the one that never reaches it.
  let started: PromiseLike<T>;
  try {
    started = work(controller.signal);
  } catch (error) {
    if (timer !== null) timerFns.clearTimeout(timer);
    return { status: "error", error };
  }

  const attempt = Promise.resolve(started).then(
    (value): BoundedOutcome<T> => ({ status: "ok", value }),
    (error): BoundedOutcome<T> => ({ status: "error", error }),
  );

  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    if (timer !== null) timerFns.clearTimeout(timer);
  }
}
