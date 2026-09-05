"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TicketCard, { type TicketCardProps } from "./TicketCard";
import { DP } from "@/lib/theme/tokens";
import {
  POLL_INTERVAL_MS,
  initialPollState,
  isTerminal,
  reducePoll,
  type PollEvent,
  type PollPhase,
  type PollState,
} from "@/lib/tickets/poll-policy";

export type SuccessInitialData = TicketCardProps;

const F = {
  display: "'DM Sans', -apple-system, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

// ─── Polling policy ──────────────────────────────────────────────────
//
// The order row is written by the Stripe webhook, which can lag the
// redirect back to this page. We poll for it — but bounded.
//
// Previously `pollCount` was incremented and never compared against a
// maximum, so a delayed or missing webhook left the customer staring at
// a loading skeleton forever, with non-OK responses silently swallowed.
//
// Now: ~60s of polling, then a recoverable state with a Retry button.
// Polling is a GET against /api/order/poll and never creates an order —
// the order is created solely by the webhook, guarded by
// create_order_atomic's stripe_session_id idempotency check. Retrying or
// refreshing this page therefore cannot produce a duplicate order.

// The attempt budget and the stop/continue decision live in
// lib/tickets/poll-policy.ts — a pure state machine, unit-testable with
// no DOM and no wall clock. This component only wires it to timers/UI.

export default function SuccessClient({
  initial,
  sessionId,
}: {
  initial: SuccessInitialData | null;
  /**
   * Passed down from the server page, which already read it from
   * searchParams. Taking it as a prop (rather than reading
   * window.location during an effect) keeps the first render identical
   * on server and client — no hydration mismatch, no setState-in-effect.
   */
  sessionId: string | null;
}) {
  // Nothing to poll for without a session id — start in the recoverable
  // state rather than behind an endless skeleton.
  const startState = (): PollState =>
    initial || sessionId ? initialPollState(!!initial) : { phase: "timed_out", attempts: 0 };

  const [data, setData] = useState<SuccessInitialData | null>(initial);
  const [phase, setPhase] = useState<PollPhase>(() => startState().phase);
  const [retryNonce, setRetryNonce] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<PollState>(startState());

  // A short, non-sensitive reference the customer can quote to support.
  // Truncated deliberately — never the full session id, phone or order.
  const sessionRef = sessionId ? sessionId.slice(-8).toUpperCase() : null;

  /** Advance the policy machine and mirror its phase into render state. */
  const dispatch = useCallback((event: PollEvent): PollState => {
    const next = reducePoll(stateRef.current, event);
    stateRef.current = next;
    setPhase(next.phase);
    return next;
  }, []);

  useEffect(() => {
    if (data) return; // resolved — nothing to poll for
    if (!sessionId) return; // already terminal via startState()
    if (isTerminal(stateRef.current)) return;

    const clear = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    pollRef.current = setInterval(async () => {
      let event: PollEvent = { type: "transient" };
      let card: SuccessInitialData | null = null;

      try {
        const res = await fetch(
          `/api/order/poll?session_id=${encodeURIComponent(sessionId)}`,
        );
        if (res.ok) {
          const payload = await res.json();
          if (payload?.card) {
            // Only a server-confirmed card resolves this page. We never
            // assert payment succeeded on our own.
            card = payload.card as SuccessInitialData;
            event = { type: "card" };
          } else {
            event = { type: "empty" };
          }
        }
        // A non-OK status stays `transient` — retried while attempts remain.
      } catch (err) {
        // Network/parse error — transient, retried while attempts remain.
        console.error("[SuccessClient] poll error:", err);
      }

      const next = dispatch(event);
      if (next.phase === "resolved" && card) {
        clear();
        setData(card);
      } else if (next.phase === "timed_out") {
        clear();
      }
    }, POLL_INTERVAL_MS);

    // Clears the interval on unmount and before any re-run.
    return clear;
  }, [data, sessionId, retryNonce, dispatch]);

  // Retry is only meaningful when there is something to poll for.
  const handleRetry = useCallback(() => {
    if (!sessionId) return;
    dispatch({ type: "retry" });
    setRetryNonce((n) => n + 1);
  }, [dispatch, sessionId]);

  if (data) {
    return <TicketCard {...data} />;
  }

  return (
    <Shell>
      {phase === "timed_out" ? (
        <StillConfirming
          sessionRef={sessionRef}
          onRetry={sessionId ? handleRetry : null}
        />
      ) : (
        <Confirming />
      )}
    </Shell>
  );
}

// ─── Presentation ────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: DP.gray[50],
        fontFamily: F.display,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <style>{`
        @keyframes tc-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: DP.zinc[0],
          borderRadius: "20px",
          padding: "40px 28px",
          textAlign: "center",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Confirming() {
  return (
    <>
      <div
        style={{
          width: "160px",
          height: "160px",
          margin: "0 auto",
          borderRadius: "14px",
          background: DP.gradient.shimmer,
          backgroundSize: "200% 100%",
          animation: "tc-shimmer 1.5s infinite",
        }}
      />
      <div
        style={{
          marginTop: "20px",
          fontSize: "16px",
          fontWeight: 700,
          color: DP.gray[900],
        }}
      >
        Confirming your order…
      </div>
      <div
        style={{
          marginTop: "6px",
          fontFamily: F.mono,
          fontSize: "12px",
          color: DP.gray[400],
          letterSpacing: "0.05em",
        }}
      >
        This usually takes a few seconds.
      </div>
    </>
  );
}

function StillConfirming({
  sessionRef,
  onRetry,
}: {
  sessionRef: string | null;
  /** Null when there is no session to poll for — the button is hidden. */
  onRetry: (() => void) | null;
}) {
  return (
    <>
      <div
        style={{
          fontSize: "40px",
          lineHeight: 1,
          marginBottom: "16px",
        }}
        aria-hidden
      >
        ⏳
      </div>
      <div
        style={{
          fontSize: "18px",
          fontWeight: 700,
          color: DP.gray[900],
        }}
      >
        We&rsquo;re still confirming your order.
      </div>
      <div
        style={{
          marginTop: "10px",
          fontSize: "14px",
          lineHeight: 1.5,
          color: DP.gray[500],
        }}
      >
        This can take a little longer than usual. Your ticket will also arrive
        by text as soon as it&rsquo;s ready — you don&rsquo;t need to pay again.
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: "22px",
            width: "100%",
            padding: "14px 20px",
            borderRadius: "12px",
            border: "none",
            background: DP.brand[500],
            color: DP.zinc[0],
            fontFamily: F.display,
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}

      <div
        style={{
          marginTop: "18px",
          fontSize: "13px",
          lineHeight: 1.5,
          color: DP.gray[500],
        }}
      >
        Still nothing? Check your texts first, then contact us and quote the
        reference below.
      </div>

      {sessionRef && (
        <div
          style={{
            marginTop: "10px",
            fontFamily: F.mono,
            fontSize: "12px",
            color: DP.gray[400],
            letterSpacing: "0.08em",
          }}
        >
          REF: {sessionRef}
        </div>
      )}
    </>
  );
}
