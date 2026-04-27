/**
 * Partner Restaurant types — shared by Studio admin UI and server actions.
 *
 * Restaurants are the canonical "venue" entity. Drops link to one via
 * `drop_items.restaurant_id`. The denormalized fields on drop_items
 * (restaurant_name, address, latitude, longitude, place_id) are kept
 * in sync at create time so the public display path doesn't need to
 * join — but the FK is the source of truth going forward.
 */

export type Restaurant = {
  id: string;
  name: string;
  city: string;
  tags: string[];
  address: string;
  latitude: number;
  longitude: number;
  place_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Minimal shape returned by `getActiveRestaurantsForDropdown()`. */
export type RestaurantOption = {
  id: string;
  name: string;
  city: string;
  tags: string[];
};

/** Form values — strings everywhere so empty inputs round-trip cleanly. */
export type RestaurantFormValues = {
  name: string;
  city: string;
  tags_input: string; // comma-separated; parsed to array on submit
  address: string;
  latitude: string;
  longitude: string;
  place_id: string;
  is_active: boolean;
  /** Form-only discriminator: "autocomplete" or "manual". Not persisted. */
  location_mode: "autocomplete" | "manual";
};

export const emptyRestaurantForm = (): RestaurantFormValues => ({
  name: "",
  city: "",
  tags_input: "",
  address: "",
  latitude: "",
  longitude: "",
  place_id: "",
  is_active: true,
  location_mode: "autocomplete",
});

/** Convert comma/whitespace-separated tag input to a clean array. */
export function parseTagsInput(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Convert a tag array back to a comma-separated string for the input. */
export function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}
