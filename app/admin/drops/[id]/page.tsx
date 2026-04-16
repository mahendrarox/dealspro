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
    .select(
      "id, title, restaurant_name, image_url, price, original_price, total_spots, start_time, end_time, is_active, is_hero, priority",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[admin/drops/${id}] fetch error:`, error.message);
    notFound();
  }

  if (!data) {
    console.error(`[admin/drops/${id}] drop not found in DB`);
    notFound();
  }

  // Validate required timestamp fields
  if (!data.start_time) {
    console.error(`[admin/drops/${id}] Missing start_time`);
    throw new Error(`Drop ${id} has no start_time`);
  }
  if (!data.end_time) {
    console.error(`[admin/drops/${id}] Missing end_time`);
    throw new Error(`Drop ${id} has no end_time`);
  }

  const startDate = new Date(data.start_time as string);
  const endDate = new Date(data.end_time as string);
  if (Number.isNaN(startDate.getTime())) {
    console.error(`[admin/drops/${id}] Invalid start_time:`, data.start_time);
    throw new Error(`Drop ${id} has invalid start_time: ${data.start_time}`);
  }
  if (Number.isNaN(endDate.getTime())) {
    console.error(`[admin/drops/${id}] Invalid end_time:`, data.end_time);
    throw new Error(`Drop ${id} has invalid end_time: ${data.end_time}`);
  }

  const initial = {
    id: data.id as string,
    title: (data.title as string) ?? "",
    restaurant_name: (data.restaurant_name as string) ?? "",
    image_url: (data.image_url as string) ?? "",
    price: String(data.price),
    original_price: data.original_price == null ? "" : String(data.original_price),
    total_spots: String(data.total_spots),
    start_time: isoToLocal(data.start_time as string),
    end_time: isoToLocal(data.end_time as string),
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
