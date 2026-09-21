import crypto from "crypto";
import { adminDb } from "@/lib/supabase-admin";
import { isMissingArchivedColumn } from "@/lib/drops/db";

/**
 * Image rules for restaurant intake.
 *
 * Two, and only two, images may ever be attached to a submission:
 *
 *   1. A file the restaurant just uploaded through the token-gated intake
 *      route, which lands under `intake/<restaurant_id>/` in the existing
 *      `dealspro-images` bucket.
 *   2. The most recent photo already attached to a PUBLISHED drop
 *      belonging to THAT SAME restaurant.
 *
 * Anything else — an arbitrary URL, another restaurant's photo, a path
 * outside this restaurant's prefix — is rejected server-side. The browser
 * sends an `image_url`, but it is never trusted: `assertImageAllowed`
 * re-derives what is permissible from the restaurant id in the verified
 * token.
 *
 * "No AI-generated food images" is a POLICY, enforced by the
 * restaurant's attestation plus operator review, with provenance signals
 * captured here as evidence for the reviewer. It is not, and is not
 * presented as, a detector.
 */

export const INTAKE_BUCKET = "dealspro-images";

/** Storage prefix that scopes an upload to one restaurant. */
export function intakeStoragePrefix(restaurantId: string): string {
  return `intake/${restaurantId}/`;
}

/**
 * Public URL prefix for this restaurant's intake uploads. Derived from
 * the storage client rather than hardcoded, so it stays correct across
 * projects and any future CDN change.
 */
export function intakePublicUrlPrefix(restaurantId: string): string {
  const probe = `${intakeStoragePrefix(restaurantId)}probe`;
  const { data } = adminDb.storage.from(INTAKE_BUCKET).getPublicUrl(probe);
  return data.publicUrl.slice(0, data.publicUrl.length - "probe".length);
}

export type LastPhoto = {
  image_url: string;
  drop_id: string;
  drop_title: string;
  published_at: string;
};

/**
 * The latest reusable photo for a restaurant.
 *
 * Eligibility, deliberately narrow:
 *   * the photo is attached to a row in `drop_items` — i.e. a drop an
 *     operator actually published; a pending submission's photo is not
 *     reusable
 *   * that drop belongs to THIS restaurant (`restaurant_id` FK)
 *   * the drop is not archived
 *   * it has an image
 *
 * Scoping is by the FK, never by restaurant name, so two partners
 * sharing a name can never see each other's photos.
 */
export async function getLastPublishedPhoto(
  restaurantId: string,
): Promise<LastPhoto | null> {
  const base = () =>
    adminDb
      .from("drop_items")
      .select("id, title, image_url, created_at")
      .eq("restaurant_id", restaurantId)
      .not("image_url", "is", null)
      .neq("image_url", "")
      .order("created_at", { ascending: false })
      .limit(1);

  let { data, error } = await base().is("archived_at", null);
  if (error && isMissingArchivedColumn(error)) {
    // Pre-migration-007 safety net, same pattern as lib/drops/db.ts.
    ({ data, error } = await base());
  }

  if (error) {
    console.error("[intake/images] getLastPublishedPhoto failed:", error.message);
    return null;
  }
  const row = (data ?? [])[0] as
    | { id: string; title: string; image_url: string; created_at: string }
    | undefined;
  if (!row || !row.image_url) return null;

  return {
    image_url: row.image_url,
    drop_id: row.id,
    drop_title: row.title,
    published_at: row.created_at,
  };
}

export type ImageCheck = { ok: true } | { ok: false; error: string };

/**
 * Authorize a submitted image URL against the restaurant from the token.
 *
 * This is the cross-tenant boundary for photos. It runs on every submit,
 * regardless of what the client claims.
 */
export async function assertImageAllowed(
  restaurantId: string,
  imageUrl: string,
  source: "upload" | "reuse",
): Promise<ImageCheck> {
  if (!imageUrl) return { ok: false, error: "A photo is required" };

  if (source === "upload") {
    const prefix = intakePublicUrlPrefix(restaurantId);
    if (!imageUrl.startsWith(prefix)) {
      return {
        ok: false,
        error: "That photo was not uploaded through this restaurant's intake link",
      };
    }
    return { ok: true };
  }

  // source === "reuse": must match a photo this restaurant has actually
  // published. Exact string equality — no prefix or host matching, which
  // could be gamed with a crafted path.
  const last = await getLastPublishedPhoto(restaurantId);
  if (!last || last.image_url !== imageUrl) {
    return {
      ok: false,
      error: "That photo is not from one of this restaurant's published drops",
    };
  }
  return { ok: true };
}

// ─── Provenance ──────────────────────────────────────────────────────

export type ImageProvenance = {
  original_filename: string | null;
  original_mime: string | null;
  original_bytes: number | null;
  /** SHA-256 of the ORIGINAL bytes, before normalization rewrites them. */
  original_sha256: string | null;
  /** Whether the original carried EXIF at all. Stripped photos are common
   *  (every messaging app removes it), so absence is a weak signal — it is
   *  recorded for the reviewer, never used to auto-reject. */
  had_exif: boolean;
  camera_make: string | null;
  camera_model: string | null;
  captured_at: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  source: "upload" | "reuse";
  /** For a reused photo: the published drop the photo came from. */
  reused_from_drop_id: string | null;
  captured_by: "intake-link";
  recorded_at: string;
};

/**
 * Read provenance from the ORIGINAL bytes.
 *
 * Order matters and is the whole point: `normalizeImage()` strips all
 * metadata on its way to WebP, so anything not read here is gone
 * forever. This must run BEFORE normalization.
 */
export async function readImageProvenance(
  input: Buffer,
  file: { name?: string; type?: string; size?: number },
): Promise<ImageProvenance> {
  const base: ImageProvenance = {
    original_filename: file.name ?? null,
    original_mime: file.type ?? null,
    original_bytes: file.size ?? input.length,
    original_sha256: crypto.createHash("sha256").update(input).digest("hex"),
    had_exif: false,
    camera_make: null,
    camera_model: null,
    captured_at: null,
    width: null,
    height: null,
    format: null,
    source: "upload",
    reused_from_drop_id: null,
    captured_by: "intake-link",
    recorded_at: new Date().toISOString(),
  };

  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(input).metadata();
    base.width = meta.width ?? null;
    base.height = meta.height ?? null;
    base.format = meta.format ?? null;
    base.had_exif = Boolean(meta.exif && meta.exif.length > 0);
  } catch (err) {
    // Provenance is evidence, not a gate. A metadata read that fails must
    // never block a legitimate upload — the upload route validates the
    // image separately by actually decoding it.
    console.warn(
      "[intake/images] provenance read failed:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return base;
}

/** Provenance record for a reused photo — no original bytes to read. */
export function reusedPhotoProvenance(last: LastPhoto): ImageProvenance {
  return {
    original_filename: null,
    original_mime: null,
    original_bytes: null,
    original_sha256: null,
    had_exif: false,
    camera_make: null,
    camera_model: null,
    captured_at: null,
    width: null,
    height: null,
    format: null,
    source: "reuse",
    reused_from_drop_id: last.drop_id,
    captured_by: "intake-link",
    recorded_at: new Date().toISOString(),
  };
}
