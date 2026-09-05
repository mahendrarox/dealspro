/**
 * Ticket price/value framing — pure math, shared by TicketCard and its
 * tests.
 *
 * IMPORTANT semantics, verified against the write path:
 *   • `orders.price_paid` is the ORDER TOTAL. The Stripe webhook writes
 *     `price_paid = item.price * quantity`
 *     (app/api/webhook/stripe/route.ts), NOT a unit price.
 *   • `drop.original_price` is a PER-UNIT regular price, so it must be
 *     multiplied by quantity before it can be compared to price_paid.
 *
 * Getting that pairing wrong is what makes a ticket claim a nonsense
 * saving at quantity > 1, so the multiplication lives here in one place.
 */

export type TicketPricing = {
  /** Total actually paid for the order. */
  paid: number;
  /** Regular value of the whole order, or null when not meaningful. */
  originalTotal: number | null;
  /** Dollar savings across the whole order. Never negative. */
  savings: number;
  /** True only when there is a real, positive saving to show. */
  showSavings: boolean;
  /** Normalized quantity (never below 1). */
  quantity: number;
};

export function computeTicketPricing(opts: {
  /** orders.price_paid — the ORDER TOTAL. */
  pricePaid: number;
  /** drop.original_price — PER-UNIT regular price, or null. */
  originalPrice: number | null;
  quantity: number;
}): TicketPricing {
  const quantity =
    Number.isFinite(opts.quantity) && opts.quantity >= 1
      ? Math.floor(opts.quantity)
      : 1;

  const paid = Number.isFinite(opts.pricePaid) ? Number(opts.pricePaid) : 0;

  const unit = opts.originalPrice;
  const originalTotal =
    unit !== null && Number.isFinite(unit) && unit > 0 ? unit * quantity : null;

  // Never fabricate or invert a saving: a regular value at or below the
  // paid amount yields no savings line at all, rather than $0.00 or a
  // negative number.
  const savings =
    originalTotal !== null ? Math.max(0, originalTotal - paid) : 0;

  const showSavings = originalTotal !== null && savings > 0;

  return { paid, originalTotal, savings, showSavings, quantity };
}
