"use client";

import { useEffect, useRef, useState } from "react";
import {
  isGooglePlacesConfigured,
  loadGooglePlaces,
} from "@/lib/admin/google-places-loader";
import type { DropFormValues, LocationMode } from "./form-utils";

type Props = {
  values: Pick<
    DropFormValues,
    "restaurant_name" | "address" | "latitude" | "longitude" | "place_id" | "location_mode"
  >;
  onChange: (patch: Partial<DropFormValues>) => void;
  /** Called with `true` while a place is being resolved so the parent can disable submit. */
  onLoadingChange?: (loading: boolean) => void;
  fieldError: (k: string) => string | undefined;
};

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
  input: "#0A0A0A",
  accent: "#3F3F46",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: T.input,
  color: T.text,
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: T.muted,
  marginBottom: 6,
  fontWeight: 600,
};
const errStyle: React.CSSProperties = { fontSize: 11, color: T.red, marginTop: 4 };
const fieldWrap: React.CSSProperties = { marginBottom: 14 };

export default function LocationPicker({
  values,
  onChange,
  onLoadingChange,
  fieldError,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const placesLibRef = useRef<google.maps.PlacesLibrary | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [fallback, setFallback] = useState(!isGooglePlacesConfigured());
  const [loading, setLoading] = useState(false);
  const locked = !!values.place_id; // autocomplete result locked in until "Change Restaurant"

  // Notify parent of loading changes so it can disable submit.
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Load Google Places once on mount. Auto-switch to manual on any failure.
  useEffect(() => {
    if (values.location_mode === "manual" || fallback) return;
    let cancelled = false;
    loadGooglePlaces()
      .then((placesLib) => {
        if (cancelled) return;
        placesLibRef.current = placesLib;
        setGoogleReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[location-picker] Google Places load failed:", err.message);
        setFallback(true);
        onChange({ location_mode: "manual" });
      });
    return () => {
      cancelled = true;
    };
  }, [values.location_mode, fallback, onChange]);

  // Attach Autocomplete widget once Google is ready AND we're not locked.
  useEffect(() => {
    if (!googleReady || locked || fallback || values.location_mode === "manual") return;
    if (!inputRef.current) return;
    if (autocompleteRef.current) return; // already attached
    const placesLib = placesLibRef.current;
    if (!placesLib) return;

    try {
      const ac = new placesLib.Autocomplete(inputRef.current, {
        fields: ["place_id", "name", "formatted_address", "geometry"],
        types: ["establishment"],
      });
      autocompleteRef.current = ac;

      const listener = ac.addListener("place_changed", () => {
        setLoading(true);
        const place = ac.getPlace();
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();

        if (!place.place_id || lat === undefined || lng === undefined) {
          setLoading(false);
          return;
        }
        onChange({
          restaurant_name: place.name ?? values.restaurant_name,
          address: place.formatted_address ?? "",
          latitude: String(lat),
          longitude: String(lng),
          place_id: place.place_id,
          location_mode: "autocomplete",
        });
        setLoading(false);
      });

      return () => {
        listener.remove();
        autocompleteRef.current = null;
      };
    } catch (err) {
      console.warn("[location-picker] Autocomplete init failed:", err);
      setFallback(true);
      onChange({ location_mode: "manual" });
    }
  }, [googleReady, locked, fallback, values.location_mode, values.restaurant_name, onChange]);

  const changeRestaurant = () => {
    onChange({
      address: "",
      latitude: "",
      longitude: "",
      place_id: "",
      location_mode: fallback ? "manual" : "autocomplete",
    });
  };

  const switchToManual = () => {
    onChange({ location_mode: "manual" });
  };

  const switchToAutocomplete = () => {
    // Clear any partial manual data so the admin starts fresh with the widget.
    onChange({
      address: "",
      latitude: "",
      longitude: "",
      place_id: "",
      location_mode: "autocomplete",
    });
    setFallback(!isGooglePlacesConfigured());
  };

  const isManualMode = values.location_mode === "manual" || fallback;

  return (
    <div
      data-testid="location-picker"
      style={{
        marginBottom: 14,
        padding: 14,
        borderRadius: 10,
        border: `1px dashed ${T.border}`,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
          Location
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isManualMode && locked && (
            <button
              type="button"
              onClick={changeRestaurant}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: T.text,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Change Restaurant
            </button>
          )}
          {!isManualMode && !locked && (
            <button
              type="button"
              onClick={switchToManual}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: T.muted,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Enter manually
            </button>
          )}
          {isManualMode && isGooglePlacesConfigured() && (
            <button
              type="button"
              onClick={switchToAutocomplete}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: T.muted,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Use autocomplete
            </button>
          )}
        </div>
      </div>

      {fallback && (
        <div
          style={{
            padding: 8,
            borderRadius: 6,
            background: "rgba(249,58,37,0.08)",
            border: "1px solid rgba(249,58,37,0.25)",
            color: T.muted,
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          Location autocomplete unavailable. Please enter details manually.
        </div>
      )}

      {!isManualMode && !locked && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Search for the restaurant</label>
          <input
            ref={inputRef}
            type="text"
            placeholder={googleReady ? "Type to search Google…" : "Loading…"}
            defaultValue={values.restaurant_name}
            style={inputStyle}
            disabled={!googleReady}
            autoComplete="off"
          />
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
            Pick a suggestion — we&apos;ll fill the name, address, and coordinates.
          </div>
        </div>
      )}

      {!isManualMode && locked && (
        <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700 }}>{values.restaurant_name || "(unnamed)"}</div>
          <div style={{ color: T.muted, fontSize: 12 }}>{values.address}</div>
          <div style={{ color: T.muted, fontSize: 11, marginTop: 2 }}>
            {values.latitude}, {values.longitude}
          </div>
        </div>
      )}

      {isManualMode && (
        <div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Restaurant name</label>
            <input
              type="text"
              value={values.restaurant_name}
              onChange={(e) => onChange({ restaurant_name: e.target.value })}
              style={inputStyle}
            />
            {fieldError("restaurant_name") && <div style={errStyle}>{fieldError("restaurant_name")}</div>}
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Address</label>
            <input
              type="text"
              value={values.address}
              onChange={(e) => onChange({ address: e.target.value })}
              placeholder="123 Main St, City, ST 00000"
              style={inputStyle}
            />
            {fieldError("address") && <div style={errStyle}>{fieldError("address")}</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={fieldWrap}>
              <label style={labelStyle}>Latitude</label>
              <input
                type="text"
                inputMode="decimal"
                value={values.latitude}
                onChange={(e) => onChange({ latitude: e.target.value })}
                placeholder="e.g. 40.7128"
                style={inputStyle}
              />
              {fieldError("latitude") && <div style={errStyle}>{fieldError("latitude")}</div>}
            </div>
            <div style={fieldWrap}>
              <label style={labelStyle}>Longitude</label>
              <input
                type="text"
                inputMode="decimal"
                value={values.longitude}
                onChange={(e) => onChange({ longitude: e.target.value })}
                placeholder="e.g. -74.0060"
                style={inputStyle}
              />
              {fieldError("longitude") && <div style={errStyle}>{fieldError("longitude")}</div>}
            </div>
          </div>
        </div>
      )}

      {fieldError("place_id") && <div style={errStyle}>{fieldError("place_id")}</div>}
      {loading && (
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Loading location details…</div>
      )}
    </div>
  );
}
