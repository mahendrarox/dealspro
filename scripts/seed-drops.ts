#!/usr/bin/env tsx
/**
 * Seed drop_items table from the hardcoded DROP_ITEMS in lib/constants.ts.
 * Idempotent: upsert on id. Run after applying migration-002-studio.sql.
 *
 * Usage: npm run seed:drops
 */
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", "..", ".env.local") });
}

import { createClient } from "@supabase/supabase-js";
import { DROP_ITEMS } from "../lib/constants";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("[seed] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function run() {
  console.log(`[seed] upserting ${DROP_ITEMS.length} drops into drop_items...`);

  let okCount = 0;
  for (const item of DROP_ITEMS) {
    const row = {
      id: item.id,
      title: item.title,
      restaurant_name: item.restaurant_name,
      image_url: item.image_url || null,
      price: item.price,
      original_price: item.original_price || null,
      total_spots: item.total_spots,
      start_time: new Date(`${item.date}T${item.start_time}:00`).toISOString(),
      end_time: new Date(`${item.date}T${item.end_time}:00`).toISOString(),
      is_active: item.status === "live",
      is_hero: false,
      priority: 0,
    };

    const { error } = await db.from("drop_items").upsert(row, { onConflict: "id" });
    if (error) {
      console.error(`[seed] ${item.id} FAILED:`, error.message);
      process.exit(1);
    }
    okCount++;
    console.log(`[seed] ${item.id} ok`);
  }

  console.log(`\n✓ seeded ${okCount} drops`);
  process.exit(0);
}

run().catch((err) => {
  console.error("[seed] fatal:", err);
  process.exit(1);
});
