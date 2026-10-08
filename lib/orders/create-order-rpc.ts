/**
 * Calling `create_order_atomic`, with a signature-mismatch fallback.
 *
 * Extracted from the Stripe webhook so the fallback is unit-testable
 * without a database, a PostgREST instance or a signed Stripe event. The
 * behaviour is byte-identical to the inline version it replaces.
 *
 * WHY A FALLBACK EXISTS AT ALL. PostgREST resolves an RPC by its NAMED
 * ARGUMENT SET. Adding `p_tag` to the call therefore stops resolving the
 * moment the deployed code is ahead of the migration — and the webhook
 * answers HTTP 200 on RPC failure so Stripe stops retrying, which means
 * the customer has paid and no order row exists. There is no retry, no
 * queue and no alert that recovers that.
 *
 * The documented deploy order is SQL first, so this window should never
 * open. It is handled anyway because the cost of being wrong is somebody
 * paying for a dinner they never receive, against a cost of one wasted
 * round trip in a case that should not happen.
 *
 * Attribution degrades; the order does not.
 */

/**
 * The shape supabase-js returns from `.rpc()`.
 *
 * `data` is deliberately left as `any`, which is what supabase-js itself
 * returns for an untyped RPC. Narrowing it here would force optional
 * chaining onto the webhook's existing reads and change what happens when
 * the RPC returns null — which is exactly the behaviour this extraction
 * is required to preserve.
 */
export type RpcOutcome = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: { code?: string; message?: string; details?: string; hint?: string } | null;
};

/** Injected so tests can drive this without a client. */
export type RpcCaller = (args: Record<string, unknown>) => Promise<RpcOutcome>;

/** PostgREST's "no function matches these argument names" code. */
export const SIGNATURE_MISMATCH = "PGRST202";

export const FALLBACK_REASON =
  "p_tag not present on create_order_atomic — apply the tag migration";

export type CreateOrderArgs = {
  p_stripe_session_id: string;
  p_phone: string;
  p_drop_item_id: string;
  p_drop_title: string;
  p_restaurant_name: string;
  p_price_paid: number;
  p_quantity: number;
  p_qr_token: string;
  p_total_spots: number;
  p_tag: string | null;
};

export type CreateOrderResult = RpcOutcome & {
  /** True when the 10-argument call was refused and the 9-argument one ran. */
  usedFallback: boolean;
};

/**
 * Call the RPC with `p_tag`; on a signature mismatch, retry without it.
 *
 * Only PGRST202 triggers the retry. Every other error — a capacity
 * failure, a constraint violation, a dropped connection — is returned
 * untouched, because retrying those would either change behaviour or
 * duplicate work. The order of the nine original arguments is never
 * altered; `p_tag` is simply absent from the second call.
 */
export async function callCreateOrderAtomic(
  call: RpcCaller,
  args: CreateOrderArgs,
  onFallback?: (info: { reason: string; tagDropped: boolean }) => void,
): Promise<CreateOrderResult> {
  const first = await call(args);
  if (first.error?.code !== SIGNATURE_MISMATCH) {
    return { ...first, usedFallback: false };
  }

  onFallback?.({ reason: FALLBACK_REASON, tagDropped: args.p_tag !== null });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { p_tag: _dropped, ...legacyArgs } = args;
  const second = await call(legacyArgs);
  return { ...second, usedFallback: true };
}
