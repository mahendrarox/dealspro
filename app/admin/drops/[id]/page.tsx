import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import DropForm, { isoToLocal } from "../drop-form";

export const dynamic = "force-dynamic";

export default async function EditDropPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const { data, error } = await adminDb
    .from("drop_items")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const initial = {
    id: data.id,
    title: data.title,
    restaurant_name: data.restaurant_name,
    image_url: data.image_url ?? "",
    price: String(data.price),
    original_price: data.original_price == null ? "" : String(data.original_price),
    total_spots: String(data.total_spots),
    start_time: isoToLocal(data.start_time),
    end_time: isoToLocal(data.end_time),
    is_active: !!data.is_active,
    is_hero: !!data.is_hero,
    priority: String(data.priority ?? 0),
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0" }}>
        Edit Drop <code style={{ fontSize: 14, color: "#A1A1AA" }}>{id}</code>
      </h1>
      <DropForm mode="edit" initial={initial} />
    </div>
  );
}
