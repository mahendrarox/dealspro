import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase-admin";
import {
  ACCEPTED_MIME_TYPES,
  MAX_RAW_SIZE_BYTES,
  OUTPUT_MIME,
  TARGET_HEIGHT,
  TARGET_WIDTH,
  buildFilename,
  isAcceptedMime,
  normalizeImage,
} from "@/lib/admin/images";
import { resolveIntakeCredential } from "@/lib/intake/session";
import { signUploadReceipt } from "@/lib/intake/token";
import { INTAKE_BUCKET, intakeStoragePrefix, readImageProvenance } from "@/lib/intake/images";

/**
 * Token-gated photo upload for the restaurant intake link.
 *
 * A deliberate SIBLING of `/api/admin/upload-image`, not a modification
 * of it. The admin route keeps its `requireAdmin()` guard exactly as it
 * was — teaching it a second credential would have widened the blast
 * radius of the one upload path operators rely on.
 *
 * What is shared is the part worth sharing: `lib/admin/images.ts`. Same
 * MIME allowlist, same 10 MB ceiling, same sharp normalization to
 * 1200×800 WebP with metadata stripped, same bucket. An intake photo and
 * a Studio photo are byte-for-byte the same kind of artifact.
 *
 * What differs:
 *   * auth is a verified intake token, not an admin cookie
 *   * objects land under `intake/<restaurant_id>/`, which is what makes
 *     cross-tenant reuse detectable at submit time
 *   * provenance is read from the ORIGINAL bytes and returned as a
 *     SIGNED receipt, because normalization destroys that evidence and
 *     the browser must not be able to author its own
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with 'token' and 'image' fields" },
      { status: 400 },
    );
  }

  // ── Auth: the link is the credential ──────────────────────────────
  // Named "token" for wire compatibility with the client; it now carries
  // either a short code or a legacy JWT, and the resolver tells them apart.
  const token = form.get("token");
  const link = await resolveIntakeCredential(typeof token === "string" ? token : null);
  if (!link.ok) {
    const status = link.reason === "unconfigured" ? 500 : 401;
    return NextResponse.json({ error: "This link is no longer valid" }, { status });
  }

  const file = form.get("image");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing 'image' file field" }, { status: 400 });
  }
  const blob = file as File;

  if (!isAcceptedMime(blob.type)) {
    return NextResponse.json(
      {
        error: `Unsupported image type "${blob.type || "unknown"}". Accepted: ${ACCEPTED_MIME_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (blob.size > MAX_RAW_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Photo is too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` },
      { status: 413 },
    );
  }

  let inputBuffer: Buffer;
  try {
    inputBuffer = Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    console.error("[intake/upload-image] read failed:", err);
    return NextResponse.json({ error: "Could not read that photo" }, { status: 400 });
  }

  // ── Provenance BEFORE normalization ───────────────────────────────
  // normalizeImage() strips every byte of metadata on its way to WebP.
  // Anything not read here is gone for good.
  const provenance = await readImageProvenance(inputBuffer, {
    name: blob.name,
    type: blob.type,
    size: blob.size,
  });

  let processed: Buffer;
  try {
    processed = await normalizeImage(inputBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    console.error("[intake/upload-image] sharp failed:", message);
    return NextResponse.json(
      { error: "Could not process that photo — please try another one" },
      { status: 400 },
    );
  }

  // Per-restaurant prefix. This is load-bearing: `assertImageAllowed`
  // rejects any submitted URL that is not under the prefix belonging to
  // the restaurant in the token.
  const objectPath = `${intakeStoragePrefix(link.restaurant.id)}${buildFilename()}`;

  const { error: uploadErr } = await adminDb.storage
    .from(INTAKE_BUCKET)
    .upload(objectPath, processed, {
      contentType: OUTPUT_MIME,
      cacheControl: "31536000, immutable",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[intake/upload-image] storage upload failed:", uploadErr.message);
    const msg = uploadErr.message.toLowerCase();
    if (msg.includes("bucket") && msg.includes("not")) {
      return NextResponse.json(
        { error: "Storage bucket missing — apply migration-006-image-storage.sql" },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Could not save that photo" }, { status: 500 });
  }

  const { data: publicUrlData } = adminDb.storage.from(INTAKE_BUCKET).getPublicUrl(objectPath);
  const url = publicUrlData.publicUrl;

  const receipt = await signUploadReceipt({
    restaurantId: link.restaurant.id,
    imageUrl: url,
    provenance: { ...provenance, stored_path: objectPath },
  });

  return NextResponse.json({
    success: true,
    url,
    // Opaque to the client; handed straight back at submit time.
    receipt,
    size: processed.length,
    dimensions: `${TARGET_WIDTH}x${TARGET_HEIGHT}`,
  });
}
