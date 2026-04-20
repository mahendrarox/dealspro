/**
 * Google Maps JS API loader — singleton.
 *
 * Uses `@googlemaps/js-api-loader` so we never inject a `<script>` tag
 * and never double-load the API. `loader.load()` is itself idempotent,
 * but we wrap it in a module-level promise so React strict-mode double
 * renders and multiple form mounts reuse the same network request.
 *
 * Client-only. Callers must ensure they run inside a `useEffect` or a
 * dynamic import with `ssr: false`.
 */

import { Loader } from "@googlemaps/js-api-loader";

let loadPromise: Promise<typeof google> | null = null;

export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY);
}

export function loadGooglePlaces(): Promise<typeof google> {
  if (loadPromise) return loadPromise;

  // DEBUG (temporary) — trace the loader lifecycle in the browser console.
  console.log("[DEBUG] Google Places loader: attempting to load");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error(
      "[DEBUG] Google Places loader error: NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set",
    );
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set"));
  }

  const loader = new Loader({
    apiKey,
    version: "weekly",
    libraries: ["places"],
  });

  loadPromise = loader.load().catch((err) => {
    // Reset so a retry after a transient failure can try again.
    loadPromise = null;
    // DEBUG (temporary) — surface the raw Google error string.
    console.error("[DEBUG] Google Places loader error:", err);
    throw err;
  });

  return loadPromise;
}
