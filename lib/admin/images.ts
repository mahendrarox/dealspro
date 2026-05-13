/**
 * Image normalization for Studio uploads.
 *
 * Every uploaded image is forced to a single canonical shape so drop cards
 * look uniform across the site:
 *
 *   • 1200 × 800 (cover-cropped, fills the frame)
 *   • WebP @ quality 85
 *   • EXIF / GPS metadata stripped
 *
 * The pipeline accepts JPEG / PNG / WebP / HEIC / HEIF (iPhone default) and
 * always emits WebP. Result file size is ~150-300 KB for typical photos.
 *
 * This module is server-only (sharp has native bindings) — never import it
 * from a client component. The `app/api/admin/upload-image` route is the
 * only caller in app code; the regression suite also imports it directly.
 */
import sharp from "sharp";
import crypto from "crypto";

export const TARGET_WIDTH = 1200;
export const TARGET_HEIGHT = 800;
export const TARGET_QUALITY = 85;
export const OUTPUT_EXT = "webp";
export const OUTPUT_MIME = "image/webp";

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_RAW_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type AcceptedMime = (typeof ACCEPTED_MIME_TYPES)[number];

export function isAcceptedMime(mime: string): mime is AcceptedMime {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Resize → cover-crop → WebP @ 85 → strip metadata.
 *
 * Returns a buffer ready for storage. Throws if the input isn't a
 * decodable image (sharp's `toBuffer` will surface the error).
 */
export async function normalizeImage(input: Buffer): Promise<Buffer> {
  return await sharp(input, { failOn: "error" })
    .rotate() // honor EXIF orientation before we strip metadata
    .resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: TARGET_QUALITY })
    .toBuffer();
}

/**
 * Build a unique storage filename: `${timestamp}-${rand}.webp`.
 *
 * Avoids an extra dependency (nanoid) by using node:crypto. 6 random bytes
 * → 8 base64url chars, matching the spec's `nanoid(8)`.
 */
export function buildFilename(now: number = Date.now()): string {
  const rand = crypto.randomBytes(6).toString("base64url");
  return `${now}-${rand}.${OUTPUT_EXT}`;
}
