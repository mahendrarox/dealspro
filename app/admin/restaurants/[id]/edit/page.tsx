import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase-admin";
import RestaurantForm from "../../restaurant-form";
import { tagsToInput, type RestaurantFormValues } from "@/lib/admin/restaurants/types";
import type { Restaurant } from "@/lib/admin/restaurants/types";

export const dynamic = "force-dynamic";

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
};

function rowToFormValues(r: Restaurant): RestaurantFormValues {
  return {
    name: r.name,
    city: r.city,
    tags_input: tagsToInput(r.tags ?? []),
    address: r.address,
    latitude: String(r.latitude),
    longitude: String(r.longitude),
    place_id: r.place_id ?? "",
    is_active: r.is_active,
    location_mode: r.place_id ? "autocomplete" : "manual",
  };
}

export default async function EditRestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const { data, error } = await adminDb
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0", color: T.text }}>
          Restaurant Error
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
            Cannot load restaurant
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
            <strong>ID:</strong> <code>{id}</code>
            {error && <> — {error.message}</>}
          </div>
          <a
            href="/admin/restaurants"
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
            ← Back to Restaurants
          </a>
        </div>
      </div>
    );
  }

  const initial = rowToFormValues(data as Restaurant);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0" }}>
        Edit Restaurant <code style={{ fontSize: 14, color: T.muted }}>{(data as Restaurant).name}</code>
      </h1>
      <RestaurantForm mode="edit" restaurantId={id} initial={initial} />
    </div>
  );
}
