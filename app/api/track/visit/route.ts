import { NextRequest, NextResponse } from "next/server";
import { recordVisit } from "@/lib/channels/events";

/**
 * Visit beacon for the customer drop page.
 *
 * Called from a client effect after the page has actually rendered in a
 * browser — never from the server render, so a prefetch, a crawl or an
 * SSR pass is not a visit. What it counts is page views: not unique
 * people, not reach, and not proof a human looked at anything.
 *
 * Public by necessity (a customer's browser calls it) and therefore
 * treated as hostile input. The body is shape-checked and bounded in
 * `lib/channels/events.ts`, nothing identifying is stored, and the
 * unique index on `dedupe_key` is what stops a replayed or retried
 * beacon inflating a count.
 *
 * It answers 204 unconditionally. A caller learns nothing from the
 * response — not whether the drop exists, not whether the tag is known,
 * not whether the row landed — so it cannot be used to probe anything.
 */

export const dynamic = "force-dynamic";

/** Bounded read: a beacon body is tiny, and this is an open endpoint. */
const MAX_BODY_BYTES = 2048;

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });

    const body = JSON.parse(raw) as {
      dropItemId?: unknown;
      tag?: unknown;
      eventId?: unknown;
    };

    await recordVisit({
      dropItemId: typeof body.dropItemId === "string" ? body.dropItemId : "",
      tag: typeof body.tag === "string" ? body.tag : null,
      clientEventId: typeof body.eventId === "string" ? body.eventId : "",
    });
  } catch {
    // Malformed body, missing table, revoked grant — all the same to the
    // caller. Recording must never be able to break a customer's page.
  }

  return new NextResponse(null, { status: 204 });
}
