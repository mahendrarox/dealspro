import { notFound, redirect } from "next/navigation";
import { getRestaurantBySlug, getClaimableDropsForRestaurant } from "@/lib/restaurants/db";
import { formatTimeWindow, formatDate } from "@/lib/drops/helpers";
import RestaurantCapture from "./capture";
import { DP } from "@/lib/theme/tokens";

// Always resolve fresh: claimable counts change as drops sell out / go
// live. `next.config.ts` adds `Cache-Control: no-store` for /r/:slug so the
// 307 redirect (single-drop case) is never cached by a CDN.
export const dynamic = "force-dynamic";

// Colors sourced from the centralized DealsPro token file (local names kept).
const T = {
  bg: DP.dark.page,
  red: DP.brand[500],
  text: "#fff",
  muted: DP.zinc[400],
  panel: DP.dark.rPanel,
  border: DP.dark.rBorder,
  display: "'DM Sans', sans-serif",
};

export default async function RestaurantSmartUrlPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Unknown / inactive restaurant → 404 (capture is reserved for a VALID
  // restaurant with zero claimable drops, never for a bogus slug).
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const claimable = await getClaimableDropsForRestaurant(restaurant.id);

  // State 2 — exactly one claimable drop → 307 redirect to it.
  if (claimable.length === 1) {
    redirect(`/drop/${claimable[0].id}`);
  }

  // State 1 — zero claimable drops → capture state.
  if (claimable.length === 0) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: T.bg,
          fontFamily: T.display,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24, maxWidth: 460 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 8 }}>
            No live drops at {restaurant.name} right now
          </h1>
          <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.5 }}>
            Get a text the moment the next deal drops.
          </p>
        </div>
        <RestaurantCapture restaurantName={restaurant.name} sourceSlug={restaurant.slug} />
      </main>
    );
  }

  // State 3 — two or more claimable drops → simple list of links (no
  // checkout, no claim action; links only).
  return (
    <main
      style={{
        minHeight: "100vh",
        background: T.bg,
        fontFamily: T.display,
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 4 }}>
          {restaurant.name}
        </h1>
        <p style={{ fontSize: 14, color: T.muted, marginBottom: 24 }}>
          {claimable.length} live drops available now
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {claimable.map((drop) => (
            <a
              key={drop.id}
              href={`/drop/${drop.id}`}
              style={{
                display: "block",
                textDecoration: "none",
                background: T.panel,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                {drop.title}
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 8 }}>
                {formatDate(drop)} · {formatTimeWindow(drop)}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: T.red }}>
                  ${drop.price.toFixed(2)}
                </span>
                {drop.original_price > drop.price && (
                  <span style={{ fontSize: 14, color: T.muted, textDecoration: "line-through" }}>
                    ${drop.original_price.toFixed(2)}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
