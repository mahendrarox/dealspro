"use client";

import { useState, useEffect, useCallback } from "react";
import { haversineDistance } from "@/lib/utils/distance";

interface Coords {
  lat: number;
  lng: number;
}

const LS_COORDS_KEY = "user_location";
const LS_DENIED_KEY = "location_denied";

export function useUserLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_COORDS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.lat && parsed?.lng) setCoords(parsed);
      }
      if (localStorage.getItem(LS_DENIED_KEY) === "true") {
        setDenied(true);
      }
    } catch {
      // localStorage unavailable — silent
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: Coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setCoords(loc);
        setLoading(false);
        try {
          localStorage.setItem(LS_COORDS_KEY, JSON.stringify(loc));
          localStorage.removeItem(LS_DENIED_KEY);
        } catch {}
      },
      () => {
        // Denied or error
        setDenied(true);
        setLoading(false);
        try {
          localStorage.setItem(LS_DENIED_KEY, "true");
        } catch {}
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  const getDistance = useCallback(
    (itemLat: number, itemLng: number): string | null => {
      if (!coords) return null;
      const d = haversineDistance(coords.lat, coords.lng, itemLat, itemLng);
      return `${d} mi away`;
    },
    [coords]
  );

  return { coords, denied, loading, requestLocation, getDistance };
}
