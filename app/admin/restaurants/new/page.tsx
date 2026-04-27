import { requireAdmin } from "@/lib/admin/auth";
import RestaurantForm from "../restaurant-form";
import { emptyRestaurantForm } from "@/lib/admin/restaurants/types";

export const dynamic = "force-dynamic";

export default async function NewRestaurantPage() {
  await requireAdmin();
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 24px 0" }}>
        New Partner Restaurant
      </h1>
      <RestaurantForm mode="create" initial={emptyRestaurantForm()} />
    </div>
  );
}
