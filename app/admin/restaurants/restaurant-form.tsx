"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  isGooglePlacesConfigured,
  loadGooglePlaces,
} from "@/lib/admin/google-places-loader";
import { createRestaurant, updateRestaurant } from "@/lib/admin/actions";
import {
  emptyRestaurantForm,
  parseTagsInput,
  type RestaurantFormValues,
} from "@/lib/admin/restaurants/types";

export { emptyRestaurantForm, type RestaurantFormValues };

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
  amber: "#D97706",
  input: "#0A0A0A",
  chip: "#1F1F26",
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

type Props = {
  mode: "create" | "edit";
  restaurantId?: string;
  initial: RestaurantFormValues;
};

export default function RestaurantForm({ mode, restaurantId, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<RestaurantFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Google Places autocomplete state
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const placesLibRef = useRef<google.maps.PlacesLibrary | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [fallback, setFallback] = useState(!isGooglePlacesConfigured());
  const locked = !!values.place_id;

  const update = <K extends keyof RestaurantFormValues>(key: K, value: RestaurantFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };
  const patchValues = useCallback((patch: Partial<RestaurantFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
  }, []);
  const fieldError = useCallback(
    (k: string) => fieldErrors[k]?.[0],
    [fieldErrors],
  );

  // Load Google Places lazily.
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
        console.warn("[restaurant-form] Google Places load failed:", err.message);
        setFallback(true);
        patchValues({ location_mode: "manual" });
      });
    return () => {
      cancelled = true;
    };
  }, [values.location_mode, fallback, patchValues]);

  // Attach Autocomplete widget once Google is ready AND we're not locked.
  useEffect(() => {
    if (!googleReady || locked || fallback || values.location_mode === "manual") return;
    if (!inputRef.current) return;
    if (autocompleteRef.current) return;
    const placesLib = placesLibRef.current;
    if (!placesLib) return;

    try {
      const ac = new placesLib.Autocomplete(inputRef.current, {
        fields: ["place_id", "name", "formatted_address", "geometry", "address_components"],
        types: ["establishment"],
      });
      autocompleteRef.current = ac;

      const listener = ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();
        if (!place.place_id || lat === undefined || lng === undefined) return;

        // Best-effort city extraction from address components.
        const components = (place.address_components ?? []) as Array<{
          long_name?: string;
          short_name?: string;
          types?: string[];
        }>;
        const cityComp = components.find((c) => c.types?.includes("locality"));
        const city = cityComp?.long_name ?? "";

        patchValues({
          name: place.name ?? values.name,
          address: place.formatted_address ?? "",
          latitude: String(lat),
          longitude: String(lng),
          place_id: place.place_id,
          city: values.city || city,
          location_mode: "autocomplete",
        });
      });

      return () => {
        listener.remove();
        autocompleteRef.current = null;
      };
    } catch (err) {
      console.warn("[restaurant-form] Autocomplete init failed:", err);
      setFallback(true);
      patchValues({ location_mode: "manual" });
    }
  }, [googleReady, locked, fallback, values.location_mode, values.name, values.city, patchValues]);

  const changeRestaurant = () => {
    patchValues({
      address: "",
      latitude: "",
      longitude: "",
      place_id: "",
      location_mode: fallback ? "manual" : "autocomplete",
    });
  };

  const switchToManual = () => {
    patchValues({ location_mode: "manual" });
  };

  const switchToAutocomplete = () => {
    patchValues({
      address: "",
      latitude: "",
      longitude: "",
      place_id: "",
      location_mode: "autocomplete",
    });
    setFallback(!isGooglePlacesConfigured());
  };

  const isManualMode = values.location_mode === "manual" || fallback;

  // Tag chip rendering — derived from comma-separated tags_input
  const tagChips = parseTagsInput(values.tags_input);
  const removeTag = (idx: number) => {
    const next = tagChips.filter((_, i) => i !== idx);
    update("tags_input", next.join(", "));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);

    const payload = {
      name: values.name.trim(),
      city: values.city.trim(),
      tags: parseTagsInput(values.tags_input),
      address: values.address.trim(),
      latitude: values.latitude === "" ? "" : Number(values.latitude),
      longitude: values.longitude === "" ? "" : Number(values.longitude),
      place_id: values.place_id.trim() || null,
      is_active: values.is_active,
    };

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createRestaurant(payload)
          : await updateRestaurant(restaurantId!, payload);

      if (res.ok) {
        setSuccess(res.noop ? "No changes" : mode === "create" ? "Created ✓" : "Updated ✓");
        if (mode === "create") {
          setTimeout(() => router.push("/admin/restaurants"), 600);
        }
      } else {
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        setFormError(res.error || "Something went wrong");
      }
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <div
        style={{
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
        }}
      >
        {/* ─── Location capture (Google or manual) ─── */}
        <div
          data-testid="restaurant-location-picker"
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
                <button type="button" onClick={changeRestaurant}
                  style={chipBtnStyle}>Change Location</button>
              )}
              {!isManualMode && !locked && (
                <button type="button" onClick={switchToManual} style={mutedBtnStyle}>
                  Enter manually
                </button>
              )}
              {isManualMode && isGooglePlacesConfigured() && (
                <button type="button" onClick={switchToAutocomplete} style={mutedBtnStyle}>
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
                style={inputStyle}
                disabled={!googleReady}
                autoComplete="off"
              />
              <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                Pick a suggestion — we&apos;ll fill name, address, city, and coordinates.
              </div>
            </div>
          )}

          {!isManualMode && locked && (
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
              <div style={{ color: T.muted, fontSize: 12 }}>{values.address}</div>
              <div style={{ color: T.muted, fontSize: 11, marginTop: 2 }}>
                {values.latitude}, {values.longitude}
              </div>
              {values.place_id && (
                <div style={{ color: T.green, fontSize: 11, marginTop: 4 }}>
                  ✓ Verified by Google
                </div>
              )}
            </div>
          )}

          {isManualMode && (
            <div>
              <div style={fieldWrap}>
                <label style={labelStyle}>Address</label>
                <input
                  type="text"
                  value={values.address}
                  onChange={(e) => update("address", e.target.value)}
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
                    onChange={(e) => update("latitude", e.target.value)}
                    placeholder="e.g. 33.1318"
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
                    onChange={(e) => update("longitude", e.target.value)}
                    placeholder="e.g. -96.7687"
                    style={inputStyle}
                  />
                  {fieldError("longitude") && <div style={errStyle}>{fieldError("longitude")}</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Display name (editable, pre-filled from Google) ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Display name</label>
          <input
            type="text"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Tikka Grill"
            style={inputStyle}
            required
          />
          {fieldError("name") && <div style={errStyle}>{fieldError("name")}</div>}
        </div>

        {/* ─── City ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>City</label>
          <input
            type="text"
            value={values.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="e.g. Frisco"
            style={inputStyle}
            required
          />
          {fieldError("city") && <div style={errStyle}>{fieldError("city")}</div>}
        </div>

        {/* ─── Tags ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input
            type="text"
            value={values.tags_input}
            onChange={(e) => update("tags_input", e.target.value)}
            placeholder="e.g. indian, vegetarian, casual"
            style={inputStyle}
          />
          {tagChips.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {tagChips.map((tag, idx) => (
                <span
                  key={`${tag}-${idx}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: T.chip,
                    border: `1px solid ${T.border}`,
                    color: T.text,
                    fontSize: 12,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(idx)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: T.muted,
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {fieldError("tags") && <div style={errStyle}>{fieldError("tags")}</div>}
        </div>

        {/* ─── Active ─── */}
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.text }}>
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
            Active (available in drop dropdown)
          </label>
        </div>
      </div>

      {formError && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "rgba(249,58,37,0.1)",
            border: "1px solid rgba(249,58,37,0.3)",
            color: T.red,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {formError}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "rgba(22,163,74,0.1)",
            border: "1px solid rgba(22,163,74,0.3)",
            color: T.green,
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          data-testid="restaurant-form-submit"
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: pending ? "#3F3F46" : T.red,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: pending ? "default" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {pending ? "Saving..." : mode === "create" ? "Add restaurant" : "Save changes"}
        </button>
        <a
          href="/admin/restaurants"
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            color: T.muted,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

const chipBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: "transparent",
  color: T.text,
  fontSize: 12,
  cursor: "pointer",
};
const mutedBtnStyle: React.CSSProperties = {
  ...chipBtnStyle,
  color: T.muted,
};
