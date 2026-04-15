#!/usr/bin/env tsx
/**
 * Verify that DB drop_items match the canonical DROP_ITEMS in constants.ts.
 * Fails loudly on any mismatch — required guard before switching runtime.
 *
 * Usage: npm run verify:drops
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
  console.error("[verify] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

function normalizeIso(s: string): string {
  return new Date(s).toISOString();
}

async function run() {
  const { data, error } = await db.from("drop_items").select();
  if (error) {
    console.error("[verify] could not read drop_items:", error.message);
    process.exit(1);
  }

  const dbMap = new Map<string, Record<string, unknown>>(
    (data ?? []).map((r: Record<string, unknown>) => [String(r.id), r]),
  );

  let mismatches = 0;
  for (const item of DROP_ITEMS) {
    const dbRow = dbMap.get(item.id);
    if (!dbRow) {
      console.error(`  ✗ ${item.id}: MISSING in DB`);
      mismatches++;
      continue;
    }

    const expected = {
      title: item.title,
      restaurant_name: item.restaurant_name,
      image_url: item.image_url || null,
      price: Number(item.price),
      original_price: item.original_price ? Number(item.original_price) : null,
      total_spots: item.total_spots,
      start_time: normalizeIso(`${item.date}T${item.start_time}:00`),
      end_time: normalizeIso(`${item.date}T${item.end_time}:00`),
    };

    const actual = {
      title: dbRow.title,
      restaurant_name: dbRow.restaurant_name,
      image_url: dbRow.image_url ?? null,
      price: Number(dbRow.price),
      original_price: dbRow.original_price === null ? null : Number(dbRow.original_price),
      total_spots: dbRow.total_spots,
      start_time: normalizeIso(String(dbRow.start_time)),
      end_time: normalizeIso(String(dbRow.end_time)),
    };

    const diffs: string[] = [];
    for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
      if (JSON.stringify(expected[k]) !== JSON.stringify(actual[k])) {
        diffs.push(`${k}: expected=${JSON.stringify(expected[k])} got=${JSON.stringify(actual[k])}`);
      }
    }

    if (diffs.length > 0) {
      console.error(`  ✗ ${item.id}:`);
      for (const d of diffs) console.error(`      ${d}`);
      mismatches++;
    } else {
      console.log(`  ✓ ${item.id}`);
    }
  }

  if (mismatches > 0) {
    console.error(`\n✗ ${mismatches} mismatch(es). Run: npm run seed:drops`);
    process.exit(1);
  }

  console.log(`\n✓ all ${DROP_ITEMS.length} drops match`);
  process.exit(0);
}

run().catch((err) => {
  console.error("[verify] fatal:", err);
  process.exit(1);
});
