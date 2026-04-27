"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDrop, updateDrop } from "@/lib/admin/actions";
import {
  addHoursToLocal,
  DEFAULT_DROP_DURATION_HOURS,
  suggestDropSlug,
  toIso,
  type DropCreateFormValues,
  type DropEditFormValues,
} from "./form-utils";
import type { RestaurantOption } from "@/lib/admin/restaurants/types";

// Re-export for backward compatibility with existing imports.
export { emptyDropForm, isoToLocal } from "./form-utils";
export type { DropCreateFormValues, DropEditFormValues } from "./form-utils";

const T = {
  panel: "#14141A",
  panelAlt: "#1A1A22",
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

type Props =
  | {
      mode: "create";
      initial: DropCreateFormValues;
      restaurants: RestaurantOption[];
    }
  | {
      mode: "edit";
      initial: DropEditFormValues;
      restaurants?: never;
    };

export default function DropForm(props: Props) {
  if (props.mode === "create") {
    return <CreateDropForm initial={props.initial} restaurants={props.restaurants} />;
  }
  return <EditDropForm initial={props.initial} />;
}

// ═══════════════════════════════════════════════════════════════════════
// CREATE FORM (partner-restaurant dropdown + smart defaults)
// ═══════════════════════════════════════════════════════════════════════

function CreateDropForm({
  initial,
  restaurants,
}: {
  initial: DropCreateFormValues;
  restaurants: RestaurantOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<DropCreateFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Track whether the admin has hand-edited derived fields. Once they
  // do, we stop overwriting their value from the smart-default chain.
  const touched = useRef({
    end_time: false,
    original_price: false,
    id: false,
  });

  const update = <K extends keyof DropCreateFormValues>(key: K, value: DropCreateFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const fieldError = useCallback(
    (k: string) => fieldErrors[k]?.[0],
    [fieldErrors],
  );

  const selectedRestaurant = restaurants.find((r) => r.id === values.restaurant_id) ?? null;

  // ── Smart default: end_time follows start_time + 2h until manually edited
  useEffect(() => {
    if (touched.current.end_time) return;
    if (!values.start_time) return;
    const next = addHoursToLocal(values.start_time, DEFAULT_DROP_DURATION_HOURS);
    if (next && next !== values.end_time) {
      setValues((v) => ({ ...v, end_time: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.start_time]);

  // ── Smart default: original_price = 2 × price until manually edited
  useEffect(() => {
    if (touched.current.original_price) return;
    if (!values.price) return;
    const p = Number(values.price);
    if (!Number.isFinite(p) || p <= 0) return;
    const next = (p * 2).toFixed(2);
    if (next !== values.original_price) {
      setValues((v) => ({ ...v, original_price: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.price]);

  // ── Smart default: drop slug from restaurant + title + date until manually edited
  useEffect(() => {
    if (touched.current.id) return;
    if (!selectedRestaurant || !values.title) return;
    const slug = suggestDropSlug({
      restaurantName: selectedRestaurant.name,
      title: values.title,
      startTimeLocal: values.start_time,
    });
    if (slug && slug !== values.id) {
      setValues((v) => ({ ...v, id: slug }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurant?.id, values.title, values.start_time]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);

    const payload = {
      id: values.id.trim(),
      title: values.title.trim(),
      restaurant_id: values.restaurant_id,
      image_url: values.image_url.trim() || null,
      price: Number(values.price),
      original_price: values.original_price === "" ? null : Number(values.original_price),
      total_spots: Number(values.total_spots),
      start_time: toIso(values.start_time),
      end_time: toIso(values.end_time),
      is_active: values.is_active,
      is_hero: values.is_hero,
      priority: Number(values.priority) || 0,
    };

    startTransition(async () => {
      const res = await createDrop(payload);
      if (res.ok) {
        setSuccess("Created ✓");
        setTimeout(() => router.push("/admin/drops"), 600);
      } else {
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        setFormError(res.error || "Something went wrong");
      }
    });
  };

  // Empty state — no active restaurants yet
  if (restaurants.length === 0) {
    return (
      <div
        style={{
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 8 }}>
          No partner restaurants yet
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
          Add a partner restaurant before creating drops.
        </div>
        <a
          href="/admin/restaurants/new"
          style={{
            display: "inline-block",
            background: T.red,
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          + Add a partner restaurant
        </a>
      </div>
    );
  }

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
        {/* ─── Partner restaurant dropdown ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Partner restaurant</label>
          <select
            value={values.restaurant_id}
            onChange={(e) => update("restaurant_id", e.target.value)}
            style={{ ...inputStyle, appearance: "auto" }}
            data-testid="drop-restaurant-select"
            required
          >
            <option value="">Select a partner restaurant…</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.city}
              </option>
            ))}
          </select>
          {fieldError("restaurant_id") && <div style={errStyle}>{fieldError("restaurant_id")}</div>}
          {selectedRestaurant && selectedRestaurant.tags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {selectedRestaurant.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: T.chip,
                    border: `1px solid ${T.border}`,
                    color: T.muted,
                    fontSize: 11,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
            Need a new restaurant?{" "}
            <a
              href="/admin/restaurants/new"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: T.text, textDecoration: "underline" }}
            >
              Add one ↗
            </a>
            {" "}— refresh this page after to see it in the list.
          </div>
        </div>

        {/* ─── Title ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Title</label>
          <input
            type="text"
            value={values.title}
            onChange={(e) => update("title", e.target.value)}
            style={inputStyle}
            placeholder="e.g. Biryani Night"
            required
          />
          {fieldError("title") && <div style={errStyle}>{fieldError("title")}</div>}
        </div>

        {/* ─── ID slug ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>ID (url slug)</label>
          <input
            type="text"
            value={values.id}
            onChange={(e) => {
              touched.current.id = true;
              update("id", e.target.value);
            }}
            placeholder="auto-suggested from restaurant + title + date"
            style={inputStyle}
            required
          />
          {fieldError("id") && <div style={errStyle}>{fieldError("id")}</div>}
        </div>

        {/* ─── Image URL ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Image URL (leave empty for gradient fallback)</label>
          <input
            type="url"
            value={values.image_url}
            onChange={(e) => update("image_url", e.target.value)}
            placeholder="https://images.unsplash.com/..."
            style={inputStyle}
          />
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

        {/* ─── Price / Original / Spots ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Price ($)</label>
            <input
              type="number"
              step="0.01"
              value={values.price}
              onChange={(e) => update("price", e.target.value)}
              style={inputStyle}
              required
            />
            {fieldError("price") && <div style={errStyle}>{fieldError("price")}</div>}
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Original Price ($, auto-fills 2× price)</label>
            <input
              type="number"
              step="0.01"
              value={values.original_price}
              onChange={(e) => {
                touched.current.original_price = true;
                update("original_price", e.target.value);
              }}
              style={inputStyle}
            />
            {fieldError("original_price") && <div style={errStyle}>{fieldError("original_price")}</div>}
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Total Spots</label>
            <input
              type="number"
              step="1"
              min="1"
              value={values.total_spots}
              onChange={(e) => update("total_spots", e.target.value)}
              style={inputStyle}
              required
            />
            {fieldError("total_spots") && <div style={errStyle}>{fieldError("total_spots")}</div>}
          </div>
        </div>

        {/* ─── Times ─── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Start Time</label>
            <input
              type="datetime-local"
              value={values.start_time}
              onChange={(e) => update("start_time", e.target.value)}
              style={inputStyle}
              required
            />
            {fieldError("start_time") && <div style={errStyle}>{fieldError("start_time")}</div>}
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>End Time (auto-fills start + 2h)</label>
            <input
              type="datetime-local"
              value={values.end_time}
              onChange={(e) => {
                touched.current.end_time = true;
                update("end_time", e.target.value);
              }}
              style={inputStyle}
              required
            />
            {fieldError("end_time") && <div style={errStyle}>{fieldError("end_time")}</div>}
          </div>
        </div>

        {/* ─── Toggles ─── */}
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.text }}>
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => update("is_active", e.target.checked)}
            />
            Active (visible on site)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.text }}>
            <input
              type="checkbox"
              checked={values.is_hero}
              onChange={(e) => update("is_hero", e.target.checked)}
            />
            Hero
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 12, color: T.muted }}>Priority</label>
            <input
              type="number"
              step="1"
              value={values.priority}
              onChange={(e) => update("priority", e.target.value)}
              style={{ ...inputStyle, width: 80 }}
            />
          </div>
        </div>
      </div>

      {formError && <FormError text={formError} />}
      {success && <FormSuccess text={success} />}

      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          data-testid="drop-form-submit"
          style={submitStyle(pending)}
        >
          {pending ? "Saving..." : "Create drop"}
        </button>
        <a href="/admin/drops" style={cancelStyle}>Cancel</a>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// EDIT FORM (read-only restaurant; everything else editable)
// ═══════════════════════════════════════════════════════════════════════

function EditDropForm({ initial }: { initial: DropEditFormValues }) {
  const [values, setValues] = useState<DropEditFormValues>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = <K extends keyof DropEditFormValues>(key: K, value: DropEditFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const fieldError = useCallback(
    (k: string) => fieldErrors[k]?.[0],
    [fieldErrors],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);

    const payload = {
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
      address: values.address.trim() || null,
      latitude: values.latitude === "" ? null : values.latitude,
      longitude: values.longitude === "" ? null : values.longitude,
      place_id: values.place_id.trim() || null,
      location_mode: values.location_mode,
    };

    startTransition(async () => {
      const res = await updateDrop(values.id, payload);
      if (res.ok) {
        setSuccess(res.noop ? "No changes" : "Updated ✓");
      } else {
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        setFormError(res.error || "Something went wrong");
      }
    });
  };

  const isLinked = !!values.restaurant_id;

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
          <label style={labelStyle}>ID (url slug) — read-only</label>
          <input
            type="text"
            value={values.id}
            disabled
            style={{ ...inputStyle, opacity: 0.6 }}
          />
        </div>

        <div style={fieldWrap}>
          <label style={labelStyle}>Title</label>
          <input
            type="text"
            value={values.title}
            onChange={(e) => update("title", e.target.value)}
            style={inputStyle}
            required
          />
          {fieldError("title") && <div style={errStyle}>{fieldError("title")}</div>}
        </div>

        {/* ─── Restaurant — read-only display ─── */}
        <div
          data-testid="drop-edit-restaurant"
          style={{
            marginBottom: 14,
            padding: 14,
            borderRadius: 10,
            border: `1px dashed ${T.border}`,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
            Restaurant {isLinked ? <span style={{ color: T.green }}>· linked</span> : <span style={{ color: T.amber }}>· legacy</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
            {values.restaurant_name || "(unnamed)"}
          </div>
          {values.address && (
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{values.address}</div>
          )}
          {values.latitude && values.longitude && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {values.latitude}, {values.longitude}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
            {isLinked
              ? "To change the restaurant, recreate this drop."
              : "Legacy drop — partner not linked. Recreate to link to a partner restaurant."}
          </div>
        </div>

        {/* ─── Image URL ─── */}
        <div style={fieldWrap}>
          <label style={labelStyle}>Image URL (leave empty for gradient fallback)</label>
          <input
            type="url"
            value={values.image_url}
            onChange={(e) => update("image_url", e.target.value)}
            placeholder="https://images.unsplash.com/..."
            style={inputStyle}
          />
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

      {formError && <FormError text={formError} />}
      {success && <FormSuccess text={success} />}

      <div style={{ display: "flex", gap: 12 }}>
        <button type="submit" disabled={pending} data-testid="drop-form-submit" style={submitStyle(pending)}>
          {pending ? "Saving..." : "Save changes"}
        </button>
        <a href="/admin/drops" style={cancelStyle}>Cancel</a>
      </div>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Shared bits
// ═══════════════════════════════════════════════════════════════════════

function FormError({ text }: { text: string }) {
  return (
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
      {text}
    </div>
  );
}

function FormSuccess({ text }: { text: string }) {
  return (
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
      {text}
    </div>
  );
}

const submitStyle = (pending: boolean): React.CSSProperties => ({
  padding: "12px 24px",
  borderRadius: 10,
  border: "none",
  background: pending ? "#3F3F46" : T.red,
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: pending ? "default" : "pointer",
  fontFamily: "'DM Sans', sans-serif",
});

const cancelStyle: React.CSSProperties = {
  padding: "12px 24px",
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  color: T.muted,
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
};
