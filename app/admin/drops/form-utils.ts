/**
 * Drop form utilities — pure functions and types shared by the form
 * component (`drop-form.tsx`, "use client") and the server pages that
 * mount it (`new/page.tsx`, `[id]/page.tsx`).
 *
 * Lives in its own file (no `"use client"` directive) so server
 * components can safely import it without Next.js bundling these
 * helpers as client-only and breaking SSR.
 */

export type DropFormValues = {
  id: string;
  title: string;
  restaurant_name: string;
  image_url: string;
  price: string;
  original_price: string;
  total_spots: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_hero: boolean;
  priority: string;
};

export const emptyDropForm = (): DropFormValues => ({
  id: "",
  title: "",
  restaurant_name: "",
  image_url: "",
  price: "",
  original_price: "",
  total_spots: "",
  start_time: "",
  end_time: "",
  is_active: false,
  is_hero: false,
  priority: "0",
});

/** Convert a datetime-local input string (local tz) to ISO-8601 with timezone. */
export function toIso(local: string): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return local;
  return d.toISOString();
}

/** Convert an ISO-8601 string to a datetime-local input value. */
export function isoToLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
