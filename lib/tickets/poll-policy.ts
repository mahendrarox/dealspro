/**
 * Success-page polling policy — a pure state machine, extracted so the
 * bounded-retry behavior is unit-testable without a DOM or a real clock.
 *
 * The order row is created by the Stripe webhook, which can lag the
 * redirect to /ticket/success. The page polls for it. Previously the
 * attempt counter was incremented but never compared to a maximum, so a
 * delayed or missing webhook polled forever behind a loading skeleton.
 *
 * This machine bounds that: MAX_POLL_ATTEMPTS attempts at
 * POLL_INTERVAL_MS, then a terminal `timed_out` phase the UI turns into
 * a Retry affordance. It is driven entirely by events — no wall clock —
 * so tests are deterministic.
 */

export const POLL_INTERVAL_MS = 2_000;
export const MAX_POLL_ATTEMPTS = 30; // 30 × 2s ≈ 60s

export type PollPhase = "polling" | "resolved" | "timed_out";

export type PollState = {
  phase: PollPhase;
  /** Attempts consumed so far in the current run. */
  attempts: number;
};

export type PollEvent =
  /** Server returned a confirmed order card. */
  | { type: "card" }
  /** 200 OK, but the webhook has not written the order yet. */
  | { type: "empty" }
  /** Non-OK HTTP status or a network/parse error — treated as transient. */
  | { type: "transient" }
  /** Customer pressed Retry. */
  | { type: "retry" };

export function initialPollState(hasCard: boolean): PollState {
  return { phase: hasCard ? "resolved" : "polling", attempts: 0 };
}

/**
 * Advance the machine. `card`, `empty` and `transient` each represent
 * one consumed attempt; `retry` resets the run.
 *
 * A transient failure is NOT terminal while attempts remain — a single
 * blip must not strand the customer.
 */
export function reducePoll(state: PollState, event: PollEvent): PollState {
  if (event.type === "retry") {
    return { phase: "polling", attempts: 0 };
  }

  // Terminal phases ignore further poll results.
  if (state.phase !== "polling") return state;

  const attempts = state.attempts + 1;

  if (event.type === "card") {
    return { phase: "resolved", attempts };
  }

  // `empty` or `transient`: keep polling until the budget is spent.
  if (attempts >= MAX_POLL_ATTEMPTS) {
    return { phase: "timed_out", attempts };
  }
  return { phase: "polling", attempts };
}

/** True when the machine has stopped issuing requests. */
export function isTerminal(state: PollState): boolean {
  return state.phase !== "polling";
}
