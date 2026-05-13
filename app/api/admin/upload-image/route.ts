import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "dealspro-images";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with an 'image' field" },
      { status: 400 },
    );
  }

  const file = form.get("image");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing 'image' file field" },
      { status: 400 },
    );
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
      {
        error: `Image is too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
      },
      { status: 413 },
    );
  }

  // Pull bytes into a Buffer for sharp.
  let inputBuffer: Buffer;
  try {
    const ab = await blob.arrayBuffer();
    inputBuffer = Buffer.from(ab);
  } catch (err) {
    console.error("[upload-image] read failed:", err);
    return NextResponse.json({ error: "Could not read uploaded file" }, { status: 400 });
  }

  // Normalize: resize → WebP @ 85 → strip metadata.
  let processed: Buffer;
  try {
    processed = await normalizeImage(inputBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown processing error";
    console.error("[upload-image] sharp failed:", message);
    return NextResponse.json(
      { error: "Could not process image — file may be corrupted or unsupported" },
      { status: 400 },
    );
  }

  const filename = buildFilename();

  const { error: uploadErr } = await adminDb.storage
    .from(BUCKET)
    .upload(filename, processed, {
      contentType: OUTPUT_MIME,
      cacheControl: "31536000, immutable",
      upsert: false,
    });

  if (uploadErr) {
    console.error("[upload-image] storage upload failed:", uploadErr.message);
    const msg = uploadErr.message.toLowerCase();
    if (msg.includes("bucket") && msg.includes("not")) {
      return NextResponse.json(
        { error: "Storage bucket missing — apply migration-006-image-storage.sql" },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Could not save image" }, { status: 500 });
  }

  const { data: publicUrlData } = adminDb.storage.from(BUCKET).getPublicUrl(filename);

  return NextResponse.json({
    success: true,
    url: publicUrlData.publicUrl,
    size: processed.length,
    dimensions: `${TARGET_WIDTH}x${TARGET_HEIGHT}`,
  });
}
