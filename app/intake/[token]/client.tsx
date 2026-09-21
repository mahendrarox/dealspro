"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  interpretMessage,
  submitDropForReview,
} from "@/lib/intake/actions";
import {
  buildQuestions,
  coerceAnswer,
  formatDateLabel,
  formatTimeLabel,
} from "@/lib/intake/questions";
import type { ExtractedDraft, RequiredDraftField } from "@/lib/intake/schemas";
import type { LastPhoto } from "@/lib/intake/images";
import { DP } from "@/lib/theme/tokens";

/**
 * The restaurant-facing intake conversation.
 *
 * Mobile-first and deliberately linear: describe → answer only what's
 * missing → photo → review → submit. Every question is tappable, with a
 * typed fallback, because the person filling this in is usually standing
 * in a kitchen holding a phone.
 *
 * Three things this component does NOT do, by design:
 *   * publish anything — the submit button creates a submission for
 *     review and says so in as many words
 *   * trust its own state — every value is re-validated server-side
 *   * invent a value the restaurant didn't give — a field the model
 *     didn't hear becomes a question, never a default
 */

const T = {
  bg: DP.dark.page,
  panel: DP.dark.rPanel,
  border: DP.dark.rBorder,
  red: DP.brand[500],
  text: "#fff",
  muted: DP.zinc[400],
  green: "#16A34A",
  amber: "#D97706",
  display: "'DM Sans', sans-serif",
};

const FALLBACK_GRADIENT = "linear-gradient(135deg, #1f2937, #374151)";
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_CLIENT_SIZE = 10 * 1024 * 1024;

type Step = "describe" | "questions" | "photo" | "review" | "done";

type Photo = {
  url: string;
  source: "upload" | "reuse";
  /** Signed provenance receipt from the upload route. Null when reusing. */
  receipt: string | null;
};

const EMPTY_DRAFT: ExtractedDraft = {
  title: null,
  price: null,
  original_price: null,
  total_spots: null,
  pickup_date: null,
  pickup_start_time: null,
  pickup_end_time: null,
};

export default function IntakeClient({
  token,
  restaurantName,
  restaurantCity,
  lastPhoto,
  anchorDate,
}: {
  token: string;
  restaurantName: string;
  restaurantCity: string;
  lastPhoto: LastPhoto | null;
  anchorDate: string;
}) {
  const [step, setStep] = useState<Step>("describe");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<ExtractedDraft>(EMPTY_DRAFT);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attested, setAttested] = useState(false);
  const [pending, startTransition] = useTransition();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  /**
   * Stable per-visit identifiers. The idempotency key is generated ONCE
   * and reused for every submit attempt in this session, so a double-tap,
   * a retry after a flaky network, or a duplicated request all collapse
   * to the same row server-side.
   */
  const [ids] = useState(() => ({
    idempotencyKey: randomId(),
    sessionId: randomId(),
  }));

  const questions = useMemo(() => buildQuestions(draft, anchorDate), [draft, anchorDate]);
  const currentQuestion = questions[0] ?? null;

  // Clear the typed answer whenever the question changes.
  useEffect(() => {
    setCustomValue("");
  }, [currentQuestion?.field]);

  // Once nothing is missing, move on automatically.
  useEffect(() => {
    if (step === "questions" && questions.length === 0) setStep("photo");
  }, [step, questions.length]);

  const onDescribe = () => {
    setError(null);
    const text = message.trim();
    if (!text) {
      setError("Tell us what you're offering first.");
      return;
    }
    startTransition(async () => {
      const res = await interpretMessage(token, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft({ ...EMPTY_DRAFT, ...res.draft });
      setDegraded(res.degraded);
      setStep(res.missing.length > 0 ? "questions" : "photo");
    });
  };

  const answer = useCallback(
    (field: RequiredDraftField, raw: string) => {
      const value = coerceAnswer(field, raw);
      if (value === undefined) {
        setError("That doesn't look right — try again.");
        return;
      }
      setError(null);
      setDraft((d) => ({ ...d, [field]: value }));
    },
    [],
  );

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      if (!ACCEPTED_MIME.includes(file.type)) {
        setError("Use a JPG, PNG, WebP or HEIC photo.");
        return;
      }
      if (file.size > MAX_CLIENT_SIZE) {
        setError(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max is 10 MB.`);
        return;
      }
      setUploading(true);
      try {
        const body = new FormData();
        body.append("token", token);
        body.append("image", file);
        const res = await fetch("/api/intake/upload-image", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.url) {
          setError(data?.error || "That photo didn't upload. Please try again.");
          return;
        }
        setPhoto({ url: data.url, source: "upload", receipt: data.receipt ?? null });
        // A newly chosen photo invalidates a prior attestation — the
        // restaurant is attesting to THIS image, not the last one.
        setAttested(false);
      } catch {
        setError("That photo didn't upload. Please check your connection.");
      } finally {
        setUploading(false);
      }
    },
    [token],
  );

  const onSubmit = () => {
    setError(null);
    if (!photo) {
      setError("Add a photo of the food first.");
      return;
    }
    if (!attested) {
      setError("Please confirm the photo is your own real food.");
      return;
    }
    startTransition(async () => {
      const res = await submitDropForReview(token, {
        raw_message: message.trim(),
        draft,
        image_url: photo.url,
        image_source: photo.source,
        photo_attestation: true,
        upload_receipt: photo.receipt,
        idempotency_key: ids.idempotencyKey,
        intake_session_id: ids.sessionId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStep("done");
    });
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <main
      style={{
        minHeight: "100vh",
        background: T.bg,
        fontFamily: T.display,
        color: T.text,
        padding: "20px 16px 56px",
      }}
    >
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.12em", color: T.muted, textTransform: "uppercase" }}>
            <span style={{ color: T.red }}>Deals</span>Pro · Submit a Drop
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px" }}>{restaurantName}</h1>
          {restaurantCity && (
            <div style={{ fontSize: 13, color: T.muted }}>{restaurantCity}</div>
          )}
        </header>

        <StepDots step={step} />

        {error && (
          <div
            data-testid="intake-error"
            style={{
              background: "rgba(249,58,37,0.12)",
              border: `1px solid ${T.red}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {step === "describe" && (
          <Panel>
            <Label>Tell us about tonight&apos;s drop</Label>
            <p style={{ fontSize: 13, color: T.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
              Just type it how you&apos;d say it. We&apos;ll ask about anything you leave out.
            </p>
            <textarea
              data-testid="intake-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder="e.g. 10 chicken biryani boxes tonight, $12 each, pickup 5-7pm"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                background: T.bg,
                color: T.text,
                fontSize: 16, // 16px prevents iOS zoom-on-focus
                fontFamily: T.display,
                resize: "vertical",
              }}
            />
            <PrimaryButton
              onClick={onDescribe}
              disabled={pending}
              testId="intake-describe-continue"
            >
              {pending ? "Reading…" : "Continue"}
            </PrimaryButton>
          </Panel>
        )}

        {step === "questions" && currentQuestion && (
          <Panel>
            {degraded && (
              <div style={{ fontSize: 12, color: T.amber, marginBottom: 10 }}>
                We couldn&apos;t read your message automatically — a few quick questions instead.
              </div>
            )}
            <Label>{currentQuestion.prompt}</Label>
            {currentQuestion.helper && (
              <p style={{ fontSize: 12, color: T.muted, margin: "0 0 10px" }}>
                {currentQuestion.helper}
              </p>
            )}

            {currentQuestion.options.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid="intake-option"
                    onClick={() => answer(currentQuestion.field, opt.value)}
                    style={{
                      padding: "12px 16px",
                      minHeight: 44, // comfortable tap target
                      borderRadius: 999,
                      border: `1px solid ${T.border}`,
                      background: "#1F1F26",
                      color: T.text,
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily: T.display,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.allowCustom && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  data-testid="intake-custom"
                  value={customValue}
                  inputMode={currentQuestion.inputMode}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      answer(currentQuestion.field, customValue);
                    }
                  }}
                  placeholder={currentQuestion.customPlaceholder}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    border: `1px solid ${T.border}`,
                    background: T.bg,
                    color: T.text,
                    fontSize: 16,
                    fontFamily: T.display,
                  }}
                />
                <button
                  type="button"
                  onClick={() => answer(currentQuestion.field, customValue)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: T.red,
                    color: "#fff",
                    fontWeight: 700,
                    fontFamily: T.display,
                    cursor: "pointer",
                  }}
                >
                  OK
                </button>
              </div>
            )}

            <div style={{ fontSize: 12, color: T.muted, marginTop: 12 }}>
              {questions.length} question{questions.length === 1 ? "" : "s"} left
            </div>
          </Panel>
        )}

        {step === "photo" && (
          <Panel>
            <Label>Add a photo of the food</Label>
            <p style={{ fontSize: 13, color: T.muted, margin: "0 0 12px", lineHeight: 1.5 }}>
              A real photo of your own food or package. AI-generated food images
              aren&apos;t allowed on DealsPro.
            </p>

            <PhotoFrame url={photo?.url ?? null} />

            <input
              ref={cameraRef}
              type="file"
              accept={ACCEPTED_MIME.join(",")}
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_MIME.join(",")}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <SecondaryButton onClick={() => cameraRef.current?.click()} disabled={uploading}>
                📷 Take photo
              </SecondaryButton>
              <SecondaryButton onClick={() => fileRef.current?.click()} disabled={uploading}>
                Choose file
              </SecondaryButton>
            </div>

            {lastPhoto && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: `1px solid ${T.border}`,
                }}
              >
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 8 }}>
                  Or reuse your last approved photo — from{" "}
                  <strong style={{ color: T.text }}>{lastPhoto.drop_title}</strong>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lastPhoto.image_url}
                    alt=""
                    style={{
                      width: 72,
                      height: 48,
                      objectFit: "cover",
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                    }}
                  />
                  <SecondaryButton
                    testId="intake-reuse-photo"
                    onClick={() => {
                      setPhoto({ url: lastPhoto.image_url, source: "reuse", receipt: null });
                      setAttested(false);
                      setError(null);
                    }}
                    disabled={uploading}
                  >
                    Reuse this photo
                  </SecondaryButton>
                </div>
              </div>
            )}

            {uploading && (
              <div style={{ fontSize: 13, color: T.muted, marginTop: 12 }}>Uploading…</div>
            )}

            <PrimaryButton
              onClick={() => {
                if (!photo) {
                  setError("Add a photo before continuing.");
                  return;
                }
                setError(null);
                setStep("review");
              }}
              disabled={uploading || !photo}
              testId="intake-photo-continue"
            >
              Continue
            </PrimaryButton>
          </Panel>
        )}

        {step === "review" && (
          <Panel>
            <Label>Check this over</Label>
            <PhotoFrame url={photo?.url ?? null} />

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>
                {draft.title}
              </div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>
                {draft.pickup_date ? formatDateLabel(draft.pickup_date) : ""}
                {draft.pickup_start_time && draft.pickup_end_time
                  ? ` · ${formatTimeLabel(draft.pickup_start_time)}–${formatTimeLabel(draft.pickup_end_time)}`
                  : ""}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: T.red }}>
                  ${Number(draft.price ?? 0).toFixed(2)}
                </span>
                {draft.original_price !== null && (
                  <span style={{ fontSize: 14, color: T.muted, textDecoration: "line-through" }}>
                    ${Number(draft.original_price).toFixed(2)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, color: T.muted }}>
                {draft.total_spots} portion{draft.total_spots === 1 ? "" : "s"} available
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep("photo")}
              style={{
                marginTop: 12,
                background: "none",
                border: "none",
                color: T.muted,
                fontSize: 13,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
                fontFamily: T.display,
              }}
            >
              Change photo
            </button>

            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                marginTop: 18,
                fontSize: 13,
                lineHeight: 1.5,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                data-testid="intake-attest"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
              />
              <span>
                This photo shows my restaurant&apos;s own real food or package. It is not
                AI-generated or taken from someone else.
              </span>
            </label>

            <PrimaryButton onClick={onSubmit} disabled={pending} testId="intake-submit">
              {pending ? "Sending…" : "Submit to DealsPro"}
            </PrimaryButton>

            <p style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.5 }}>
              This sends your drop to the DealsPro team for review. It doesn&apos;t go live
              until we publish it.
            </p>
          </Panel>
        )}

        {step === "done" && (
          <Panel>
            <div style={{ textAlign: "center", padding: "16px 0" }} data-testid="intake-done">
              <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
                Sent to DealsPro
              </h2>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
                Our team will review <strong style={{ color: T.text }}>{draft.title}</strong> and
                publish it. You&apos;ll get the customer link once it&apos;s live.
              </p>
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}

// ─── Small presentational pieces ─────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: 18,
      }}
    >
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>{children}</h2>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        width: "100%",
        marginTop: 16,
        padding: "15px 18px",
        minHeight: 48,
        borderRadius: 12,
        border: "none",
        background: disabled ? "#3F1A14" : T.red,
        color: "#fff",
        fontSize: 16,
        fontWeight: 800,
        fontFamily: T.display,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      style={{
        padding: "12px 16px",
        minHeight: 44,
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        background: "#1F1F26",
        color: T.text,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: T.display,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function PhotoFrame({ url }: { url: string | null }) {
  return (
    <div
      data-testid="intake-photo-frame"
      style={{
        width: "100%",
        height: 200,
        borderRadius: 16,
        overflow: "hidden",
        background: FALLBACK_GRADIENT,
        border: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600 }}>
          No photo yet
        </span>
      )}
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["describe", "questions", "photo", "review"];
  const activeIndex = step === "done" ? order.length : order.indexOf(step);
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {order.map((s, i) => (
        <div
          key={s}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: i <= activeIndex ? T.red : T.border,
          }}
        />
      ))}
    </div>
  );
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
