import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase-admin";
import { isMissingArchivedColumn } from "@/lib/drops/db";
import DropRow from "./row";

export const dynamic = "force-dynamic";

type DropRowType = {
  id: string;
  title: string;
  restaurant_name: string;
  image_url: string | null;
  price: number | string;
  original_price: number | string | null;
  total_spots: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_hero: boolean;
  priority: number;
  archived_at?: string | null;
};

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
};

const SELECT_COLS =
  "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority, archived_at";

export default async function AdminDropsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireAdmin();
  const { view } = await searchParams;
  const archivedView = view === "archived";

  const baseDrops = () =>
    adminDb
      .from("drop_items")
      .select(SELECT_COLS)
      .order("is_hero", { ascending: false })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

  // Default list: archived_at IS NULL. Archived view: archived_at IS NOT NULL.
  let dropsRes = await (archivedView
    ? baseDrops().not("archived_at", "is", null)
    : baseDrops().is("archived_at", null));

  let migrationMissing = false;
  if (dropsRes.error && isMissingArchivedColumn(dropsRes.error)) {
    migrationMissing = true;
    if (archivedView) {
      // No archived rows can exist before the column is migrated.
      dropsRes = { ...dropsRes, data: [], error: null };
    } else {
      // Pre-migration fallback: list everything, no archive filter.
      dropsRes = await adminDb
        .from("drop_items")
        .select(SELECT_COLS.replace(", archived_at", ""))
        .order("is_hero", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
    }
  }

  const ordersRes = await adminDb.from("orders").select("drop_item_id, quantity").eq("status", "paid");

  const drops = (dropsRes.data as DropRowType[] | null) ?? [];
  const orders = (ordersRes.data ?? []) as { drop_item_id: string | null; quantity: number | null }[];

  // Compute spots_remaining: total_spots - SUM(quantity WHERE status='paid')
  const claimed: Record<string, number> = {};
  for (const o of orders) {
    if (!o.drop_item_id) continue;
    claimed[o.drop_item_id] = (claimed[o.drop_item_id] ?? 0) + (o.quantity ?? 1);
  }

  const tab = (label: string, href: string, active: boolean) => (
    <a
      href={href}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: `1px solid ${active ? T.text : T.border}`,
        background: active ? "rgba(244,244,245,0.06)" : "transparent",
        color: active ? T.text : T.muted,
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {label}
    </a>
  );

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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
            {archivedView ? "Archived Drops" : "All Drops"}
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            {tab("Active", "/admin/drops", !archivedView)}
            {tab("Archived", "/admin/drops?view=archived", archivedView)}
          </div>
        </div>
        {!archivedView && (
          <a
            href="/admin/drops/new"
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
            + New Drop
          </a>
        )}
      </div>

      {migrationMissing && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "rgba(217,119,6,0.1)",
            border: "1px solid rgba(217,119,6,0.3)",
            color: "#D97706",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          Archive is not enabled yet — apply <code style={{ color: T.text }}>migration-007-archive-drops.sql</code> in Supabase to use it.
        </div>
      )}

      {dropsRes.error && (
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
          Failed to load drops: {dropsRes.error.message}
        </div>
      )}

      {drops.length === 0 && !dropsRes.error && (
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
          {archivedView
            ? "No archived drops."
            : (
              <>
                No drops yet. Run <code style={{ color: T.text }}>npm run seed:drops</code> or create one.
              </>
            )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {drops.map((d) => {
          const totalClaimed = claimed[d.id] ?? 0;
          const remaining = Math.max(0, d.total_spots - totalClaimed);
          return (
            <DropRow
              key={d.id}
              archivedView={archivedView}
              drop={{
                id: d.id,
                title: d.title,
                restaurant_name: d.restaurant_name,
                image_url: d.image_url,
                price: Number(d.price),
                total_spots: d.total_spots,
                spots_remaining: remaining,
                claimed: totalClaimed,
                is_active: d.is_active,
                is_hero: d.is_hero,
                priority: d.priority,
                archived_at: d.archived_at ?? null,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
