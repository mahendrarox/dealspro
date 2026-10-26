/**
 * Deciding WHEN a drop page counts as visited.
 *
 * A mount is not a visit. A tab opened in the background — middle-click,
 * "open in new tab", a restored session — mounts immediately and may
 * never be looked at. Counting that would inflate every channel's visits
 * with pages nobody saw.
 *
 * So: send when the page is visible, and when it is not, wait for it to
 * become visible. A tab that is closed without ever being brought
 * forward is never counted, which is the correct answer rather than a
 * lost one.
 *
 * Extracted from the component and given its dependencies as arguments
 * so the hidden→visible path can be tested without a browser.
 */

export type BeaconDoc = {
  visibilityState: string;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export type BeaconState = { sent: boolean };

/**
 * Arrange for `send` to be called once, the first time `doc` is visible.
 *
 * Returns a cleanup function to run on unmount. `state` is shared across
 * invocations of the same mount (a ref), so React's double-invoked
 * effect in development cannot produce two beacons.
 */
export function startVisitBeacon(
  doc: BeaconDoc,
  state: BeaconState,
  send: () => void,
): () => void {
  if (state.sent) return () => {};

  let listening = false;

  const attempt = () => {
    if (state.sent) return;
    if (doc.visibilityState !== "visible") return;

    // Set BEFORE sending: if `send` throws, this must still not fire a
    // second time. A lost count is better than a double count.
    state.sent = true;
    detach();
    send();
  };

  const detach = () => {
    if (!listening) return;
    listening = false;
    doc.removeEventListener("visibilitychange", attempt);
  };

  // Already visible — the overwhelmingly common case — sends now, with
  // no listener ever attached.
  attempt();

  if (!state.sent) {
    listening = true;
    doc.addEventListener("visibilitychange", attempt);
  }

  return detach;
}
