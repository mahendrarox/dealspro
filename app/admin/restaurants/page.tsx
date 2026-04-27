import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase-admin";
import RestaurantRow from "./row";
import type { Restaurant } from "@/lib/admin/restaurants/types";

export const dynamic = "force-dynamic";

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
};

export default async function AdminRestaurantsPage() {
  await requireAdmin();

  const { data, error } = await adminDb
    .from("restaurants")
    .select("*")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  const restaurants = (data as Restaurant[] | null) ?? [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Partner Restaurants</h1>
        <a
          href="/admin/restaurants/new"
          style={{
            background: T.red,
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          + Add Restaurant
        </a>
      </div>

      {error && (
        <div
          style={{
            padding: 16,
            borderRadius: 10,
            background: "rgba(249,58,37,0.1)",
            border: "1px solid rgba(249,58,37,0.3)",
            color: T.red,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          Failed to load restaurants: {error.message}
        </div>
      )}

      {restaurants.length === 0 && !error && (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: T.muted,
            background: T.panel,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
          }}
        >
          Add your first partner restaurant to start creating drops.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {restaurants.map((r) => (
          <RestaurantRow
            key={r.id}
            restaurant={{
              id: r.id,
              name: r.name,
              city: r.city,
              tags: r.tags ?? [],
              place_id: r.place_id,
              is_active: r.is_active,
            }}
          />
        ))}
      </div>
    </div>
  );
}
