// ─── Drop Item Model ──────────────────────────────────────────────────

export interface DropItem {
  id: string;
  drop_id: string;
  restaurant_name: string;
  title: string;
  date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM" 24h
  end_time: string; // "HH:MM" 24h
  price: number; // e.g. 9.99
  original_price: number; // e.g. 19.99
  total_spots: number;
  image_url: string;
  status: "live" | "sold_out" | "expired";
  stripe_price_id: string; // empty for now — using price_data
  redemption_valid_until: string; // ISO datetime "YYYY-MM-DDTHH:MM:SS"
}

// ─── Hardcoded Drop Items ─────────────────────────────────────────────

export const DROP_ITEMS: DropItem[] = [
  {
    id: "drop-biryani-mar28",
    drop_id: "week_mar_28",
    restaurant_name: "Tikka Grill",
    title: "Biryani Night",
    date: "2026-03-28",
    start_time: "17:00",
    end_time: "19:00",
    price: 9.99,
    original_price: 19.99,
    total_spots: 7,
    image_url: "",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: "2026-03-29T23:59:00",
  },
  {
    id: "drop-butterchicken-mar29",
    drop_id: "week_mar_28",
    restaurant_name: "Tikka Grill",
    title: "Butter Chicken Night",
    date: "2026-03-29",
    start_time: "18:00",
    end_time: "20:00",
    price: 9.99,
    original_price: 19.99,
    total_spots: 7,
    image_url: "",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: "2026-03-30T23:59:00",
  },
  {
    id: "drop-tandoori-mar30",
    drop_id: "week_mar_28",
    restaurant_name: "Tikka Grill",
    title: "Tandoori Special",
    date: "2026-03-30",
    start_time: "17:00",
    end_time: "19:00",
    price: 12.99,
    original_price: 24.99,
    total_spots: 6,
    image_url: "",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: "2026-03-31T23:59:00",
  },
];

// ─── Lookups ──────────────────────────────────────────────────────────

export function getDropItem(id: string): DropItem | undefined {
  return DROP_ITEMS.find((item) => item.id === id);
}

export function getDropItems(): DropItem[] {
  return DROP_ITEMS;
}

// ─── Time Helpers ─────────────────────────────────────────────────────

/** Build a Date from item.date + a time string like "17:00" */
function toDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

/** True if current time is before the item's start_time on its date */
export function canPurchase(item: DropItem): boolean {
  return new Date() < toDate(item.date, item.start_time);
}

/** True if current time is between start_time and end_time on the item's date */
export function isPickupInProgress(item: DropItem): boolean {
  const now = new Date();
  return now >= toDate(item.date, item.start_time) && now < toDate(item.date, item.end_time);
}

/** True if current time is past the item's end_time */
export function hasEnded(item: DropItem): boolean {
  return new Date() >= toDate(item.date, item.end_time);
}

/** True if the QR / deal card is still valid for redemption */
export function isRedemptionValid(item: DropItem): boolean {
  return new Date() < new Date(item.redemption_valid_until);
}

/** Format time window for display: "5–7 PM" or "6–8 PM" */
export function formatTimeWindow(item: DropItem): string {
  const fmt = (t: string) => {
    const [h] = t.split(":").map(Number);
    const hour12 = h > 12 ? h - 12 : h;
    const ampm = h >= 12 ? "PM" : "AM";
    return { hour12, ampm };
  };
  const start = fmt(item.start_time);
  const end = fmt(item.end_time);
  if (start.ampm === end.ampm) {
    return `${start.hour12}–${end.hour12} ${end.ampm}`;
  }
  return `${start.hour12} ${start.ampm}–${end.hour12} ${end.ampm}`;
}

/** Format date for display: "Friday, Mar 28" */
export function formatDate(item: DropItem): string {
  const d = new Date(`${item.date}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/** Human-readable time context: "Tonight", "Tomorrow evening", "In 2 days", etc. */
export function getTimeContext(item: DropItem): string {
  const now = new Date();
  const eventDate = new Date(`${item.date}T${item.start_time}:00`);
  const diffMs = eventDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffMs < 0) {
    if (isPickupInProgress(item)) return "Pickup in progress";
    return "Ended";
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const dayDiff = Math.round((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) {
    if (diffHours <= 3) return `Starts in ${Math.ceil(diffHours)}h`;
    return "Tonight";
  }
  if (dayDiff === 1) {
    const startHour = parseInt(item.start_time.split(":")[0]);
    return startHour >= 17 ? "Tomorrow evening" : "Tomorrow";
  }
  if (dayDiff <= 6) return `In ${dayDiff} days`;
  return formatDate(item);
}

/** Compute savings: original_price - price */
export function getSavings(item: DropItem): number {
  return item.original_price - item.price;
}

/** Compute discount percentage */
export function getDiscountPct(item: DropItem): number {
  return Math.round(((item.original_price - item.price) / item.original_price) * 100);
}

// ─── Deprecated (remove after full migration) ─────────────────────────

/** @deprecated Use DROP_ITEMS or getDropItem() instead */
export const HARDCODED_DROP = {
  id: DROP_ITEMS[0].id,
  title: `${DROP_ITEMS[0].restaurant_name} ${DROP_ITEMS[0].title}`,
  restaurant_name: DROP_ITEMS[0].restaurant_name,
  price_cents: Math.round(DROP_ITEMS[0].price * 100),
  pickup_window: formatTimeWindow(DROP_ITEMS[0]),
} as const;
