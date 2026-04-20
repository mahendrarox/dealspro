/**
 * Google Maps JS API loader — singleton (v2 functional API).
 *
 * `@googlemaps/js-api-loader` v2 removed the `Loader` class. We use the
 * new functional API: `setOptions()` registers the key + version once,
 * then `importLibrary('places')` lazy-loads the Places library and
 * returns it.
 *
 * Module-level promise caches the `importLibrary('places')` result so
 * React strict-mode double renders and multiple picker mounts share a
 * single network request.
 *
 * Client-only. Callers must ensure they run inside a `useEffect` or a
 * dynamic import with `ssr: false`.
 */

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let placesPromise: Promise<google.maps.PlacesLibrary> | null = null;
let optionsSet = false;

export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY);
}

export function loadGooglePlaces(): Promise<google.maps.PlacesLibrary> {
  if (placesPromise) return placesPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set"));
  }

  // setOptions must be called before any importLibrary. Guard so a
  // remount after a transient failure doesn't re-register.
  if (!optionsSet) {
    setOptions({ key: apiKey, v: "weekly" });
    optionsSet = true;
  }

  placesPromise = importLibrary("places").catch((err) => {
    // Reset so a retry after a transient failure can try again.
    placesPromise = null;
    throw err;
  });

  return placesPromise;
}
