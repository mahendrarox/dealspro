"use client";

/**
 * ImageUpload — mobile-first image upload with URL-paste fallback.
 *
 * Replaces the URL-only flow in Studio. Tabs let the admin either upload a
 * file (default) or paste an existing https URL. Uploads go through
 * /api/admin/upload-image which normalizes to 1200×800 WebP at q=85 and
 * stores the result in the `dealspro-images` Supabase Storage bucket.
 *
 * Mobile UX:
 *   • Single tap → "Take photo" opens the rear camera (capture="environment")
 *   • "Choose file" picker available alongside
 *   • Drag-and-drop is desktop-only (hidden on <640px via media query)
 *   • Subtle haptic on success if navigator.vibrate is supported
 *
 * Existing external URLs (Unsplash, Imgur, etc.) keep working — they render
 * identically in the preview area and on the public page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { validateImageUrl } from "@/app/admin/drops/drop-image-input";

const T = {
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
  amber: "#D97706",
  input: "#0A0A0A",
  chip: "#1F1F26",
};

const FALLBACK_GRADIENT = "linear-gradient(135deg, #1f2937, #374151)";
const RADIUS = 16;

const MAX_CLIENT_SIZE = 10 * 1024 * 1024;
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

type Tab = "upload" | "url";
type UploadState =
  | { kind: "idle" }
  | { kind: "selected"; previewUrl: string; file: File }
  | { kind: "uploading"; previewUrl: string; progress: number }
  | { kind: "uploaded" }
  | { kind: "error"; message: string; previewUrl?: string; file?: File };

export type ImageUploadProps = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
};

export default function ImageUpload({ value, onChange, label }: ImageUploadProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // Object URLs we create for client-side previews — revoke when done.
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // Show "uploaded" until the parent's URL changes or user clears.
  useEffect(() => {
    if (!value && state.kind === "uploaded") {
      setState({ kind: "idle" });
    }
  }, [value, state.kind]);

  const startUpload = useCallback(
    (file: File) => {
      // Client-side guards (server re-validates).
      if (!ACCEPTED_MIME.includes(file.type)) {
        setState({
          kind: "error",
          message: `Unsupported file type. Use JPG, PNG, WebP, or HEIC.`,
        });
        return;
      }
      if (file.size > MAX_CLIENT_SIZE) {
        setState({
          kind: "error",
          message: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — must be under 10 MB.`,
        });
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(previewUrl);
      setState({ kind: "uploading", previewUrl, progress: 0 });

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", "/api/admin/upload-image");

      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        const progress = Math.min(99, Math.round((e.loaded / e.total) * 100));
        setState((s) => (s.kind === "uploading" ? { ...s, progress } : s));
      });

      xhr.onload = () => {
        xhrRef.current = null;
        let body: { success?: boolean; url?: string; error?: string };
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          setState({
            kind: "error",
            message: `Server error (HTTP ${xhr.status})`,
            previewUrl,
            file,
          });
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300 && body.success && body.url) {
          onChange(body.url);
          setState({ kind: "uploaded" });
          setShowSuccess(true);
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try {
              navigator.vibrate(50);
            } catch {
              /* ignore */
            }
          }
          setTimeout(() => setShowSuccess(false), 2000);
        } else {
          setState({
            kind: "error",
            message: body.error || `Upload failed (HTTP ${xhr.status})`,
            previewUrl,
            file,
          });
        }
      };

      xhr.onerror = () => {
        xhrRef.current = null;
        setState({
          kind: "error",
          message: "Network error — check your connection and try again",
          previewUrl,
          file,
        });
      };

      const formData = new FormData();
      formData.append("image", file);
      xhr.send(formData);
    },
    [onChange],
  );

  const onFileSelected = (file: File | null | undefined) => {
    if (!file) return;
    startUpload(file);
  };

  const retry = () => {
    if (state.kind === "error" && state.file) {
      startUpload(state.file);
    }
  };

  const remove = () => {
    if (xhrRef.current) {
      try {
        xhrRef.current.abort();
      } catch {
        /* ignore */
      }
      xhrRef.current = null;
    }
    setState({ kind: "idle" });
    onChange("");
    setShowSuccess(false);
  };

  // ── Drag and drop (desktop) ───────────────────────────────────────
  const lastDragOver = useRef(0);
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastDragOver.current < 60) return; // throttle ~16fps
    lastDragOver.current = now;
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    onFileSelected(file);
  };

  // ── URL tab handlers ──────────────────────────────────────────────
  const onUrlChange = (next: string) => {
    setUrlError(null);
    onChange(next);
  };
  const onUrlBlur = () => {
    setUrlError(validateImageUrl(value));
  };

  // ── Derived preview src ───────────────────────────────────────────
  const previewSrc =
    state.kind === "uploading" || state.kind === "selected"
      ? state.previewUrl
      : state.kind === "error" && state.previewUrl
        ? state.previewUrl
        : value;

  const hasPreview = !!previewSrc;
  const uploading = state.kind === "uploading";

  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: T.muted,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {label ?? "Image"}
      </label>

      {/* ─── Tabs ─── */}
      <div
        role="tablist"
        aria-label="Image source"
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: T.input,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          marginBottom: 10,
        }}
      >
        <TabButton
          active={tab === "upload"}
          onClick={() => setTab("upload")}
          label="Upload"
          testId="image-upload-tab-upload"
        />
        <TabButton
          active={tab === "url"}
          onClick={() => setTab("url")}
          label="Paste URL"
          testId="image-upload-tab-url"
        />
      </div>

      {tab === "upload" && (
        <UploadPane
          state={state}
          isDragging={isDragging}
          hasPreview={hasPreview}
          previewSrc={previewSrc}
          showSuccess={showSuccess}
          uploading={uploading}
          onTakePhoto={() => cameraInputRef.current?.click()}
          onChooseFile={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onRetry={retry}
          onRemove={remove}
        />
      )}

      {tab === "url" && (
        <UrlPane
          value={value}
          urlError={urlError}
          onUrlChange={onUrlChange}
          onUrlBlur={onUrlBlur}
        />
      )}

      {/* Hidden file inputs (mobile camera + standard picker) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onFileSelected(e.target.files?.[0])}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="image-upload-camera-input"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(e) => onFileSelected(e.target.files?.[0])}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="image-upload-file-input"
      />

      {/* Responsive style: hide drag zone on mobile */}
      <style>{`
        @media (max-width: 639px) {
          [data-image-upload-dropzone] {
            cursor: default;
          }
          [data-image-upload-droptext] { display: none !important; }
        }
        @media (min-width: 640px) {
          [data-image-upload-mobile-actions] { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════

function TabButton({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      data-testid={testId}
      style={{
        flex: 1,
        padding: "8px 12px",
        borderRadius: 6,
        border: "none",
        background: active ? T.chip : "transparent",
        color: active ? T.text : T.muted,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {label}
    </button>
  );
}

function UploadPane({
  state,
  isDragging,
  hasPreview,
  previewSrc,
  showSuccess,
  uploading,
  onTakePhoto,
  onChooseFile,
  onDragOver,
  onDragLeave,
  onDrop,
  onRetry,
  onRemove,
}: {
  state: UploadState;
  isDragging: boolean;
  hasPreview: boolean;
  previewSrc: string;
  showSuccess: boolean;
  uploading: boolean;
  onTakePhoto: () => void;
  onChooseFile: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const erroring = state.kind === "error";
  const isUploaded = state.kind === "uploaded";

  return (
    <>
      <div
        data-image-upload-dropzone=""
        data-testid="image-upload-preview"
        data-state={state.kind}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={!hasPreview && !uploading ? onChooseFile : undefined}
        style={{
          position: "relative",
          width: "100%",
          height: 256,
          borderRadius: RADIUS,
          overflow: "hidden",
          background: FALLBACK_GRADIENT,
          border: `1px ${hasPreview ? "solid" : "dashed"} ${
            erroring ? T.red : isDragging ? T.green : T.border
          }`,
          cursor: !hasPreview && !uploading ? "pointer" : "default",
          transition: "border-color 120ms ease",
        }}
      >
        {hasPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              display: "block",
              opacity: uploading ? 0.65 : 1,
            }}
          />
        )}

        {/* Empty-state overlay */}
        {!hasPreview && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "rgba(255,255,255,0.75)",
              fontFamily: "'DM Sans', sans-serif",
              padding: 16,
              textAlign: "center",
              pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 32 }} aria-hidden="true">📷</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Tap to upload or take photo
            </div>
            <div
              data-image-upload-droptext=""
              style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}
            >
              or drag & drop here
            </div>
          </div>
        )}

        {/* Uploading overlay */}
        {uploading && state.kind === "uploading" && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "12px 16px",
              background: "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))",
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
            }}
            data-testid="image-upload-progress"
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span>Uploading…</span>
              <span>{state.progress}%</span>
            </div>
            <div
              style={{
                height: 4,
                background: "rgba(255,255,255,0.2)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${state.progress}%`,
                  height: "100%",
                  background: T.green,
                  transition: "width 120ms ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Success badge */}
        {showSuccess && (
          <div
            role="status"
            aria-live="polite"
            data-testid="image-upload-success"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(22,163,74,0.95)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ✓ Uploaded
          </div>
        )}

        {/* Change / Remove overlay buttons (when image present, not uploading) */}
        {hasPreview && !uploading && (isUploaded || !erroring) && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              display: "flex",
              gap: 8,
            }}
          >
            <OverlayButton onClick={onChooseFile} label="Change" />
            <OverlayButton onClick={onRemove} label="Remove" />
          </div>
        )}

        {/* Error overlay */}
        {erroring && state.kind === "error" && (
          <div
            data-testid="image-upload-error"
            role="alert"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 12, maxWidth: 320 }}>
              {state.message}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <OverlayButton onClick={onRetry} label="Try again" />
              <OverlayButton onClick={onChooseFile} label="Pick another" />
              <OverlayButton onClick={onRemove} label="Cancel" />
            </div>
          </div>
        )}
      </div>

      {/* Mobile action buttons (hidden on ≥640px via CSS) */}
      <div
        data-image-upload-mobile-actions=""
        style={{
          display: "flex",
          gap: 8,
          marginTop: 10,
        }}
      >
        <ActionButton
          onClick={onTakePhoto}
          disabled={uploading}
          label="📷 Take photo"
          testId="image-upload-take-photo"
        />
        <ActionButton
          onClick={onChooseFile}
          disabled={uploading}
          label="📁 Choose file"
          testId="image-upload-choose-file"
        />
      </div>
    </>
  );
}

function UrlPane({
  value,
  urlError,
  onUrlChange,
  onUrlBlur,
}: {
  value: string;
  urlError: string | null;
  onUrlChange: (next: string) => void;
  onUrlBlur: () => void;
}) {
  return (
    <div>
      <input
        type="url"
        value={value}
        onChange={(e) => onUrlChange(e.target.value)}
        onBlur={onUrlBlur}
        placeholder="https://..."
        data-testid="image-upload-url-input"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${urlError ? T.red : T.border}`,
          background: T.input,
          color: T.text,
          fontSize: 14,
          fontFamily: "'DM Sans', sans-serif",
        }}
      />
      {urlError && (
        <div
          style={{
            fontSize: 11,
            color: T.red,
            marginTop: 4,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {urlError}
        </div>
      )}

      <div
        style={{
          position: "relative",
          marginTop: 10,
          width: "100%",
          height: 256,
          borderRadius: RADIUS,
          overflow: "hidden",
          background: FALLBACK_GRADIENT,
          border: `1px solid ${T.border}`,
        }}
        data-testid="image-upload-url-preview"
      >
        {value && !urlError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              display: "block",
            }}
          />
        )}
        {!value && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.55)",
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            No image yet
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  label,
  testId,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        flex: 1,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        background: disabled ? "rgba(255,255,255,0.04)" : T.chip,
        color: disabled ? T.muted : T.text,
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {label}
    </button>
  );
}

function OverlayButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 6,
        border: `1px solid rgba(255,255,255,0.4)`,
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        backdropFilter: "blur(6px)",
      }}
    >
      {label}
    </button>
  );
}
