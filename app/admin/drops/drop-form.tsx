"use client";
import { useCallback, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createDrop, updateDrop } from "@/lib/admin/actions";
import { type DropFormValues, toIso } from "./form-utils";

// Re-export for backward compatibility with existing imports.
export { emptyDropForm, isoToLocal, type DropFormValues } from "./form-utils";

// Client-only: the Google loader touches `window`. Using `next/dynamic` with
// ssr: false keeps the Google Places SDK out of the server bundle.
const LocationPicker = dynamic(() => import("./location-picker"), { ssr: false });

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
  input: "#0A0A0A",
};

type Props = {
  mode: "create" | "edit";
  initial: DropFormValues;
};

export default function DropForm({ mode, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<DropFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [locationLoading, setLocationLoading] = useState(false);

  const update = <K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  // Stable patch handler used by LocationPicker — merges multiple fields atomically.
  const patchValues = useCallback((patch: Partial<DropFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
  }, []);

  const fieldError = useCallback(
    (k: string) => fieldErrors[k]?.[0],
    [fieldErrors],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);

    const locationPayload = {
      address: values.address.trim() || null,
      latitude: values.latitude === "" ? null : values.latitude,
      longitude: values.longitude === "" ? null : values.longitude,
      place_id: values.place_id.trim() || null,
      location_mode: values.location_mode,
    };

    const payload = {
      id: values.id.trim(),
      title: values.title.trim(),
      restaurant_name: values.restaurant_name.trim(),
      image_url: values.image_url.trim() || null,
      price: Number(values.price),
      original_price: values.original_price === "" ? null : Number(values.original_price),
      total_spots: Number(values.total_spots),
      start_time: toIso(values.start_time),
      end_time: toIso(values.end_time),
      is_active: values.is_active,
      is_hero: values.is_hero,
      priority: Number(values.priority) || 0,
      ...locationPayload,
    };

    startTransition(async () => {
      const res =
        mode === "create"
          ? await createDrop(payload)
          : await updateDrop(values.id, payload);

      if (res.ok) {
        setSuccess(res.noop ? "No changes" : mode === "create" ? "Created ✓" : "Updated ✓");
        if (mode === "create") {
          setTimeout(() => router.push("/admin/drops"), 600);
        }
      } else {
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        setFormError(res.error || "Something went wrong");
      }
    });
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

  const submitDisabled = pending || locationLoading;

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
        <div style={fieldWrap}>
          <label style={labelStyle}>ID (url slug) {mode === "edit" && "— read-only"}</label>
          <input
            type="text"
            value={values.id}
            onChange={(e) => update("id", e.target.value)}
            disabled={mode === "edit"}
            placeholder="drop-example-sep10"
            style={{ ...inputStyle, opacity: mode === "edit" ? 0.6 : 1 }}
            required
          />
          {fieldError("id") && <div style={errStyle}>{fieldError("id")}</div>}
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Title</label>
          <input type="text" value={values.title} onChange={(e) => update("title", e.target.value)} style={inputStyle} required />
          {fieldError("title") && <div style={errStyle}>{fieldError("title")}</div>}
        </div>

        <LocationPicker
          values={values}
          onChange={patchValues}
          onLoadingChange={setLocationLoading}
          fieldError={fieldError}
        />

        <div style={fieldWrap}>
          <label style={labelStyle}>Image URL (leave empty for gradient fallback)</label>
          <input type="url" value={values.image_url} onChange={(e) => update("image_url", e.target.value)} placeholder="https://images.unsplash.com/..." style={inputStyle} />
          {fieldError("image_url") && <div style={errStyle}>{fieldError("image_url")}</div>}
          {!values.image_url && (
            <div
              style={{
                marginTop: 8,
                height: 80,
                borderRadius: 8,
                background: "linear-gradient(135deg, #1f2937, #374151)",
              }}
            />
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Price ($)</label>
            <input type="number" step="0.01" value={values.price} onChange={(e) => update("price", e.target.value)} style={inputStyle} required />
            {fieldError("price") && <div style={errStyle}>{fieldError("price")}</div>}
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Original Price ($, optional)</label>
            <input type="number" step="0.01" value={values.original_price} onChange={(e) => update("original_price", e.target.value)} style={inputStyle} />
            {fieldError("original_price") && <div style={errStyle}>{fieldError("original_price")}</div>}
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Total Spots</label>
            <input type="number" step="1" min="1" value={values.total_spots} onChange={(e) => update("total_spots", e.target.value)} style={inputStyle} required />
            {fieldError("total_spots") && <div style={errStyle}>{fieldError("total_spots")}</div>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Start Time</label>
            <input type="datetime-local" value={values.start_time} onChange={(e) => update("start_time", e.target.value)} style={inputStyle} required />
            {fieldError("start_time") && <div style={errStyle}>{fieldError("start_time")}</div>}
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>End Time</label>
            <input type="datetime-local" value={values.end_time} onChange={(e) => update("end_time", e.target.value)} style={inputStyle} required />
            {fieldError("end_time") && <div style={errStyle}>{fieldError("end_time")}</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.text }}>
            <input type="checkbox" checked={values.is_active} onChange={(e) => update("is_active", e.target.checked)} />
            Active (visible on site)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.text }}>
            <input type="checkbox" checked={values.is_hero} onChange={(e) => update("is_hero", e.target.checked)} />
            Hero
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: T.muted }}>Priority</label>
            <input type="number" step="1" value={values.priority} onChange={(e) => update("priority", e.target.value)} style={{ ...inputStyle, width: 80 }} />
          </div>
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
          disabled={submitDisabled}
          data-testid="drop-form-submit"
          style={{
            padding: "12px 24px",
            borderRadius: 10,
            border: "none",
            background: submitDisabled ? "#3F3F46" : T.red,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: submitDisabled ? "default" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {pending ? "Saving..." : locationLoading ? "Loading location…" : mode === "create" ? "Create drop" : "Save changes"}
        </button>
        <a
          href="/admin/drops"
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
