import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase-admin";
import { getSubmission, generateUniqueDropId } from "@/lib/intake/db";
import type { IntakeDraft } from "@/lib/intake/schemas";
import { formatDateLabel, formatTimeLabel } from "@/lib/intake/questions";
import type { RestaurantOption } from "@/lib/admin/restaurants/types";
import type { DropCreateFormValues } from "../../drops/form-utils";
import DropForm from "../../drops/drop-form";
import RejectSubmission from "./reject";

/**
 * Operator review for one restaurant submission.
 *
 * The whole point of this screen is that it is NOT a new publishing
 * path. It renders the existing Studio drop form, prefilled, and the
 * Publish button runs the existing `createDrop()` server action behind
 * `requireAdmin()`. Everything that guards a manually created drop —
 * zod validation, the pickup-window rule, the partner-restaurant
 * lookup, the admin log — guards this one identically.
 *
 * The drop id is resolved against live data here so a legitimate repeat
 * drop (same restaurant, same dish, same day) gets its own id and
 * therefore its own URL, instead of colliding with the previous drop.
 */

export const dynamic = "force-dynamic";

const T = {
  panel: "#14141A",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
  amber: "#D97706",
  chip: "#1F1F26",
};

export default async function SubmissionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const { row, migrationMissing } = await getSubmission(id);

  if (migrationMissing) {
    return (
      <Notice tone="amber">
        <strong>Not available yet.</strong> Apply{" "}
        <code>migration-009-drop-submissions.sql</code>, then reload.
      </Notice>
    );
  }
  if (!row) notFound();

  const draft = row.draft as IntakeDraft;
  const provenance = (row.image_provenance ?? {}) as Record<string, unknown>;

  // The restaurant option list is scoped to THIS submission's partner —
  // an operator reviewing a submission is confirming that restaurant's
  // offer, not re-assigning it to a different one.
  const { data: restaurantRow } = await adminDb
    .from("restaurants")
    .select("id, name, city, tags, is_active")
    .eq("id", row.restaurant_id)
    .maybeSingle();

  const restaurant = restaurantRow as
    | (RestaurantOption & { is_active: boolean })
    | null;

  const alreadyReviewed = row.status !== "submitted";

  // Central wall clock straight from the submission — no conversion
  // here, because the drop form's datetime-local inputs are themselves
  // America/Chicago wall clock and `toIso()` does the conversion on save.
  const startLocal = `${draft.pickup_date}T${draft.pickup_start_time}`;
  const endLocal = `${draft.pickup_date}T${draft.pickup_end_time}`;

  const dropId =
    restaurant && !alreadyReviewed
      ? await generateUniqueDropId({
          restaurantName: restaurant.name,
          title: draft.title,
          startTimeLocal: startLocal,
        })
      : "";

  const initial: DropCreateFormValues = {
    id: dropId,
    title: draft.title,
    restaurant_id: row.restaurant_id,
    image_url: row.image_url,
    price: String(draft.price),
    // Empty unless the restaurant explicitly supplied one. The form's
    // "2 × price" smart default is switched off for prefilled
    // submissions, so this stays empty rather than inventing a discount.
    original_price: draft.original_price === null ? "" : String(draft.original_price),
    total_spots: String(draft.total_spots),
    start_time: startLocal,
    end_time: endLocal,
    is_active: true,
    is_hero: false,
    priority: "0",
  };

  return (
    <div>
      <a
        href="/admin/submissions"
        style={{ fontSize: 13, color: T.muted, textDecoration: "none" }}
      >
        ← Submissions
      </a>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "10px 0 4px 0" }}>
        {draft.title}
      </h1>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
        {row.restaurant_name}
        {row.restaurant_city ? ` · ${row.restaurant_city}` : ""} · submitted{" "}
        {new Date(row.submitted_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT
      </div>

      {row.status === "published" && (
        <Notice tone="green">
          <strong>Published.</strong>{" "}
          {row.published_drop_id ? (
            <>
              Live at{" "}
              <a href={`/drop/${row.published_drop_id}`} style={{ color: T.green }}>
                /drop/{row.published_drop_id}
              </a>
              .
            </>
          ) : (
            "The linked drop has since been removed."
          )}{" "}
          Reviewed by {row.reviewed_by ?? "—"}.
        </Notice>
      )}
      {row.status === "rejected" && (
        <Notice tone="amber">
          <strong>Rejected</strong> by {row.reviewed_by ?? "—"}.
          {row.review_note ? ` Note: ${row.review_note}` : ""}
        </Notice>
      )}
      {!restaurant?.is_active && (
        <Notice tone="amber">
          This partner restaurant is currently <strong>inactive</strong>. Activate it
          before publishing — <code>createDrop()</code> refuses an inactive partner.
        </Notice>
      )}

      {/* ── What the restaurant actually sent ───────────────────────── */}
      <section
        style={{
          background: T.panel,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: 18,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>
          What the restaurant sent
        </h2>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={row.image_url}
            alt=""
            style={{
              width: 260,
              height: 174,
              objectFit: "cover",
              borderRadius: 10,
              border: `1px solid ${T.border}`,
            }}
          />
          <div style={{ flex: 1, minWidth: 240 }}>
            <blockquote
              style={{
                margin: "0 0 12px",
                padding: "10px 12px",
                background: "#0A0A0A",
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                fontSize: 13,
                color: T.text,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {row.raw_message}
            </blockquote>

            <Fact label="Parsed window">
              {formatDateLabel(draft.pickup_date)} ·{" "}
              {formatTimeLabel(draft.pickup_start_time)}–
              {formatTimeLabel(draft.pickup_end_time)} CT
            </Fact>
            <Fact label="Price">
              ${Number(draft.price).toFixed(2)}
              {draft.original_price === null
                ? " (no original price supplied)"
                : ` (was $${Number(draft.original_price).toFixed(2)})`}
            </Fact>
            <Fact label="Portions">{draft.total_spots}</Fact>
          </div>
        </div>

        {/* ── Photo attestation + provenance ───────────────────────── */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <div style={{ fontSize: 13, color: T.green, fontWeight: 600, marginBottom: 8 }}>
            ✓ Restaurant attested this is its own real food
            {row.attested_at
              ? ` (${new Date(row.attested_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT)`
              : ""}
          </div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
            Photo source: <strong style={{ color: T.text }}>{row.image_source}</strong>
            {row.image_source === "reuse" && provenance.reused_from_drop_id
              ? ` (from drop ${String(provenance.reused_from_drop_id)})`
              : ""}
            <br />
            {row.image_source === "upload" && (
              <>
                Original: {String(provenance.original_filename ?? "—")} ·{" "}
                {provenance.original_bytes
                  ? `${(Number(provenance.original_bytes) / 1024).toFixed(0)} KB`
                  : "—"}{" "}
                · {String(provenance.format ?? "—")} {String(provenance.width ?? "?")}×
                {String(provenance.height ?? "?")}
                <br />
                EXIF present: <strong style={{ color: T.text }}>
                  {provenance.had_exif ? "yes" : "no"}
                </strong>{" "}
                <span style={{ opacity: 0.8 }}>
                  (most phones and messaging apps strip EXIF — absence is not evidence of
                  anything on its own)
                </span>
                <br />
                SHA-256: <code style={{ fontSize: 11 }}>
                  {String(provenance.original_sha256 ?? "—").slice(0, 32)}…
                </code>
              </>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.amber, marginTop: 10, lineHeight: 1.6 }}>
            AI-generated food images are not permitted. These signals are advisory —
            check the photo looks like this restaurant&apos;s real food before publishing.
          </div>
        </div>

        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 12, color: T.muted, cursor: "pointer" }}>
            Audit trail
          </summary>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.8 }}>
            Submission <code>{row.id}</code>
            <br />
            Intake link <code>{row.intake_token_jti}</code>
            {row.intake_token_expires_at
              ? ` (expires ${new Date(row.intake_token_expires_at).toISOString()})`
              : ""}
            <br />
            Browser session <code>{row.intake_session_id ?? "—"}</code>
            <br />
            Idempotency key <code>{row.idempotency_key}</code>
          </div>
        </details>
      </section>

      {/* ── Publish through the existing Studio flow ────────────────── */}
      {alreadyReviewed ? null : !restaurant ? (
        <Notice tone="amber">
          The partner restaurant for this submission no longer exists.
        </Notice>
      ) : (
        <>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
            Review &amp; publish
          </h2>
          <p style={{ fontSize: 13, color: T.muted, margin: "0 0 16px" }}>
            This is the standard Studio drop form, prefilled. Publishing creates a new
            drop with a new URL — it never edits a previous one.
          </p>
          <DropForm
            mode="create"
            initial={initial}
            restaurants={[restaurant]}
            submissionId={row.id}
          />
          <RejectSubmission submissionId={row.id} />
        </>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>
      <span style={{ color: T.muted }}>{label}: </span>
      <span style={{ color: T.text }}>{children}</span>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "green" | "amber";
  children: React.ReactNode;
}) {
  const color = tone === "green" ? T.green : T.amber;
  return (
    <div
      style={{
        background: tone === "green" ? "rgba(22,163,74,0.12)" : "rgba(217,119,6,0.12)",
        border: `1px solid ${color}`,
        borderRadius: 10,
        padding: "12px 14px",
        fontSize: 13,
        color: T.text,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}
