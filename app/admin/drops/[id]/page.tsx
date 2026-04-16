import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase-admin";
import DropForm, { isoToLocal } from "../drop-form";

export const dynamic = "force-dynamic";

// ─── Validation layer ────────────────────────────────────────────────

type ValidatedDrop = {
  id: string;
  title: string;
  restaurant_name: string;
  image_url: string;
  price: string;
  original_price: string;
  total_spots: string;
  start_time: string; // datetime-local format
  end_time: string;
  is_active: boolean;
  is_hero: boolean;
  priority: string;
};

type ValidationResult =
  | { ok: true; drop: ValidatedDrop }
  | { ok: false; error: string };

const REQUIRED_FIELDS = ["title", "restaurant_name", "price", "total_spots", "start_time", "end_time"] as const;

function validateDrop(data: Record<string, unknown> | null, id: string): ValidationResult {
  if (!data) {
    return { ok: false, error: `Drop not found: ${id}` };
  }

  // Check required fields exist
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === null || data[field] === undefined) {
      return { ok: false, error: `${field} is missing for drop ${id}` };
    }
  }

  // Validate timestamps are parseable
  const startDate = new Date(data.start_time as string);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, error: `Invalid start_time for drop ${id}: ${String(data.start_time)}` };
  }

  const endDate = new Date(data.end_time as string);
  if (Number.isNaN(endDate.getTime())) {
    return { ok: false, error: `Invalid end_time for drop ${id}: ${String(data.end_time)}` };
  }

  return {
    ok: true,
    drop: {
      id: String(data.id),
      title: String(data.title),
      restaurant_name: String(data.restaurant_name),
      image_url: data.image_url ? String(data.image_url) : "",
      price: String(data.price),
      original_price: data.original_price == null ? "" : String(data.original_price),
      total_spots: String(data.total_spots),
      start_time: isoToLocal(data.start_time as string),
      end_time: isoToLocal(data.end_time as string),
      is_active: !!data.is_active,
      is_hero: !!data.is_hero,
      priority: String(data.priority ?? 0),
    },
  };
}

// ─── Error UI ────────────────────────────────────────────────────────

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
};

function DropError({ id, error }: { id: string; error: string }) {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0", color: T.text }}>
        Drop Error
      </h1>
      <div
        style={{
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: T.red, marginBottom: 12 }}>
          Cannot load drop for editing
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 8 }}>
          <strong>ID:</strong> <code>{id}</code>
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
        <a
          href="/admin/drops"
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            color: T.muted,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ← Back to Drops
        </a>
      </div>
    </div>
  );
}

// ─── Page component ──────────────────────────────────────────────────

export default async function EditDropPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  // 1. FETCH
  const { data, error: fetchError } = await adminDb
    .from("drop_items")
    .select(
      "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("[admin/drops/edit] FETCH ERROR", { id, error: fetchError.message });
    return <DropError id={id} error={`Database error: ${fetchError.message}`} />;
  }

  // 2. VALIDATE
  console.log("[admin/drops/edit] DROP LOAD DEBUG", { id, raw: data });

  const result = validateDrop(data as Record<string, unknown> | null, id);

  if (!result.ok) {
    console.error("[admin/drops/edit] VALIDATION FAILED", { id, error: result.error });
    return <DropError id={id} error={result.error} />;
  }

  // 3. SAFE RENDER — only validated data used below
  const drop = result.drop;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0" }}>
        Edit Drop <code style={{ fontSize: 14, color: "#A1A1AA" }}>{drop.id}</code>
      </h1>
      <DropForm mode="edit" initial={drop} />
    </div>
  );
}
