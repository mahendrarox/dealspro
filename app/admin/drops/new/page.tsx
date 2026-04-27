import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase-admin";
import DropForm from "../drop-form";
import { emptyDropForm } from "../form-utils";
import type { RestaurantOption } from "@/lib/admin/restaurants/types";

export const dynamic = "force-dynamic";

export default async function NewDropPage() {
  await requireAdmin();

  // Fetch the active partner restaurants for the dropdown.
  const { data, error } = await adminDb
    .from("restaurants")
    .select("id, name, city, tags")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[admin/drops/new] failed to load restaurants:", error.message);
  }
  const restaurants = (data as RestaurantOption[] | null) ?? [];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0" }}>New Drop</h1>
      <DropForm mode="create" initial={emptyDropForm()} restaurants={restaurants} />
    </div>
  );
}
