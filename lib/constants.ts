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
  status: "live" | "sold_out" | "expired" | "cancelled";
  stripe_price_id: string; // empty for now — using price_data
  redemption_valid_until: string; // ISO datetime "YYYY-MM-DDTHH:MM:SS"
  address: string; // e.g. "Frisco, TX"
  lat: number; // latitude
  lng: number; // longitude
}

// DEV ONLY: Dynamic dates for testing. Replace with real dates before production launch.

// ─── Dynamic Date Helpers ────────────────────────────────────────────

function devDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function devRedemption(daysFromToday: number): string {
  // Day after the drop date at 23:59
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday + 1);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${dateStr}T23:59:00`;
}

// Drop schedule: one drop per day, spread across +2 .. +9 days from "today"
// in the server's local (Central) timezone. Minimum +2 guarantees every drop
// is at least ~24h ahead regardless of the hour at which the seed is run.
const _dayOffsets = [2, 3, 4, 5, 6, 7, 8, 9];
const _dropWeekId = `week_dev_dynamic`;

// ─── Drop Items (dynamic dates) ──────────────────────────────────────

export const DROP_ITEMS: DropItem[] = [
  {
    id: "drop-biryani-apr07",
    drop_id: _dropWeekId,
    restaurant_name: "Tikka Grill",
    title: "Biryani Night",
    date: devDate(_dayOffsets[0]),
    start_time: "19:00",
    end_time: "21:00",
    price: 9.99,
    original_price: 19.99,
    total_spots: 7,
    image_url: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[0]),
    address: "Frisco, TX",
    lat: 33.1507,
    lng: -96.8236,
  },
  {
    id: "drop-butterchicken-apr08",
    drop_id: _dropWeekId,
    restaurant_name: "Tikka Grill",
    title: "Butter Chicken Night",
    date: devDate(_dayOffsets[1]),
    start_time: "20:00",
    end_time: "22:00",
    price: 9.99,
    original_price: 19.99,
    total_spots: 7,
    image_url: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[1]),
    address: "Frisco, TX",
    lat: 33.1507,
    lng: -96.8236,
  },
  {
    id: "drop-tandoori-apr09",
    drop_id: _dropWeekId,
    restaurant_name: "Tikka Grill",
    title: "Tandoori Special",
    date: devDate(_dayOffsets[2]),
    start_time: "19:00",
    end_time: "21:00",
    price: 12.99,
    original_price: 24.99,
    total_spots: 6,
    image_url: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[2]),
    address: "Frisco, TX",
    lat: 33.1507,
    lng: -96.8236,
  },
  {
    id: "drop-pizza-combo-apr10",
    drop_id: _dropWeekId,
    restaurant_name: "Napoli Fire",
    title: "Pizza Combo Deal",
    date: devDate(_dayOffsets[3]),
    start_time: "20:00",
    end_time: "22:00",
    price: 14.99,
    original_price: 29.99,
    total_spots: 20,
    image_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[3]),
    address: "Plano, TX",
    lat: 33.0198,
    lng: -96.6989,
  },
  {
    id: "drop-taco-tuesday-apr10",
    drop_id: _dropWeekId,
    restaurant_name: "El Ranchero",
    title: "Taco Tuesday Special",
    date: devDate(_dayOffsets[4]),
    start_time: "19:00",
    end_time: "21:00",
    price: 7.99,
    original_price: 15.99,
    total_spots: 30,
    image_url: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[4]),
    address: "Allen, TX",
    lat: 33.1032,
    lng: -96.6706,
  },
  {
    id: "drop-bbq-plate-apr11",
    drop_id: _dropWeekId,
    restaurant_name: "Smokey's BBQ",
    title: "BBQ Plate Drop",
    date: devDate(_dayOffsets[5]),
    start_time: "20:00",
    end_time: "22:00",
    price: 16.99,
    original_price: 34.99,
    total_spots: 10,
    image_url: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[5]),
    address: "McKinney, TX",
    lat: 33.1972,
    lng: -96.6397,
  },
  {
    id: "drop-sushi-platter-apr11",
    drop_id: _dropWeekId,
    restaurant_name: "Sakura Ramen",
    title: "Sushi Platter Night",
    date: devDate(_dayOffsets[6]),
    start_time: "19:00",
    end_time: "21:00",
    price: 19.99,
    original_price: 39.99,
    total_spots: 12,
    image_url: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[6]),
    address: "Frisco, TX",
    lat: 33.1507,
    lng: -96.8236,
  },
  {
    id: "drop-dessert-box-apr12",
    drop_id: _dropWeekId,
    restaurant_name: "Sweet Bites",
    title: "Dessert Box Deal",
    date: devDate(_dayOffsets[7]),
    start_time: "20:00",
    end_time: "22:00",
    price: 11.99,
    original_price: 24.99,
    total_spots: 15,
    image_url: "https://images.unsplash.com/photo-1567206563064-6f60f40a2b57?auto=format&fit=crop&w=800&q=80",
    status: "live",
    stripe_price_id: "",
    redemption_valid_until: devRedemption(_dayOffsets[7]),
    address: "Richardson, TX",
    lat: 32.9483,
    lng: -96.7299,
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

/** True if current time is before the item's start_time on its date and item is not cancelled */
export function canPurchase(item: DropItem): boolean {
  if (item.status === "cancelled") return false;
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

/** Get current date in US Central Time (DFW area) */
function getCentralDate(d: Date): { year: number; month: number; day: number } {
  const parts = d.toLocaleDateString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "numeric", day: "numeric" }).split("/");
  return { year: parseInt(parts[2]), month: parseInt(parts[0]), day: parseInt(parts[1]) };
}

/**
 * Human-readable time context with time window.
 * "Tonight · 5–7 PM" | "Tomorrow · 5–7 PM" | "Thu, Apr 2 · 5–7 PM"
 * Uses US Central Time for today/tomorrow calculations (DFW area).
 */
export function getTimeContext(item: DropItem): string {
  const now = new Date();
  const eventDate = new Date(`${item.date}T${item.start_time}:00`);
  const diffMs = eventDate.getTime() - now.getTime();
  const tw = formatTimeWindow(item);

  if (diffMs < 0) {
    if (isPickupInProgress(item)) return `Pickup in progress · ${tw}`;
    return "Ended";
  }

  const todayCT = getCentralDate(now);
  const [ey, em, ed] = item.date.split("-").map(Number);

  const todayNum = todayCT.year * 10000 + todayCT.month * 100 + todayCT.day;
  const eventNum = ey * 10000 + em * 100 + ed;
  const dayDiff = eventNum - todayNum;

  if (dayDiff === 0) {
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours <= 3) return `Starts in ${Math.ceil(diffHours)}h · ${tw}`;
    return `Tonight · ${tw}`;
  }
  if (dayDiff === 1) return `Tomorrow · ${tw}`;

  // "Thu, Apr 2 · 5–7 PM"
  const d = new Date(`${item.date}T12:00:00`);
  const short = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${short} · ${tw}`;
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
