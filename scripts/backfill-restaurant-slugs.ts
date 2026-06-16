#!/usr/bin/env tsx
/**
 * One-off backfill: assign a stable, unique `slug` to every restaurant that
 * doesn't yet have one.
 *
 * Uses the SAME `slugify()` + `resolveSlugCollision()` the Studio create
 * path uses, so backfilled slugs and future slugs follow identical rules.
 *
 * Strategy (deterministic, no random suffixes):
 *   - Process rows ordered by created_at ASC, id ASC (stable, re-runnable).
 *   - base = slugify(name); empty → `restaurant-<first id segment>`.
 *   - Collisions resolve to base, base-2, base-3, … (first free integer).
 *   - Rows that already have a slug are left untouched (idempotent).
 *
 * Usage:
 *   npx tsx scripts/backfill-restaurant-slugs.ts          (writes)
 *   npx tsx scripts/backfill-restaurant-slugs.ts --dry    (preview only)
 */
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", "..", ".env.local") });
}

import { createClient } from "@supabase/supabase-js";
import { slugify, resolveSlugCollision } from "../lib/slug";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("[backfill-slugs] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry");
const db = createClient(url, key, { auth: { persistSession: false } });

type Row = { id: string; name: string; slug: string | null; created_at: string };

async function main() {
  const { data, error } = await db
    .from("restaurants")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("[backfill-slugs] fetch failed:", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as Row[];

  // Seed the taken-set with slugs that already exist (idempotency).
  const taken = new Set<string>();
  for (const r of rows) {
    if (r.slug) taken.add(r.slug);
  }

  const plan: { id: string; name: string; slug: string }[] = [];
  for (const r of rows) {
    if (r.slug) continue; // already assigned — skip
    const base = slugify(r.name) || `restaurant-${r.id.split("-")[0]}`;
    const slug = resolveSlugCollision(base, taken);
    taken.add(slug);
    plan.push({ id: r.id, name: r.name, slug });
  }

  console.log(
    `[backfill-slugs] ${rows.length} restaurants, ${plan.length} need slugs${dryRun ? " (dry run)" : ""}`,
  );
  for (const p of plan) console.log(`  ${p.slug}  ←  ${p.name}`);

  if (dryRun || plan.length === 0) {
    console.log("[backfill-slugs] no writes performed.");
    process.exit(0);
  }

  let written = 0;
  for (const p of plan) {
    const { error: updErr } = await db
      .from("restaurants")
      .update({ slug: p.slug })
      .eq("id", p.id);
    if (updErr) {
      console.error(`[backfill-slugs] update failed for ${p.id} (${p.name}):`, updErr.message);
      process.exit(1);
    }
    written += 1;
  }

  console.log(`[backfill-slugs] wrote ${written} slugs. Done.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill-slugs] fatal:", e);
  process.exit(1);
});
