import { requireAdmin } from "@/lib/admin/auth";
import { listSubmissions, type SubmissionStatus } from "@/lib/intake/db";
import type { IntakeDraft } from "@/lib/intake/schemas";
import { formatDateLabel, formatTimeLabel } from "@/lib/intake/questions";

/**
 * Studio review queue for restaurant-submitted drops.
 *
 * Nothing on this page is public and nothing on it publishes. It lists
 * `drop_submissions` rows — which exist entirely outside the drop
 * lifecycle — and links each one to a review screen where an operator
 * publishes through the existing authenticated Studio flow.
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

const TABS: { key: SubmissionStatus | "all"; label: string }[] = [
  { key: "submitted", label: "Needs review" },
  { key: "published", label: "Published" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const active = (TABS.find((t) => t.key === status)?.key ?? "submitted") as
    | SubmissionStatus
    | "all";

  const { rows, migrationMissing } = await listSubmissions(
    active === "all" ? undefined : active,
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px 0" }}>
        Restaurant Submissions
      </h1>
      <p style={{ fontSize: 13, color: T.muted, margin: "0 0 20px" }}>
        Drops restaurants sent in through their private intake link. Nothing here is
        live — publishing happens in the drop form, as usual.
      </p>

      {migrationMissing && (
        <div
          style={{
            background: "rgba(217,119,6,0.12)",
            border: `1px solid ${T.amber}`,
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 13,
            color: T.text,
            marginBottom: 20,
          }}
        >
          <strong>Not available yet.</strong> Apply{" "}
          <code>migration-009-drop-submissions.sql</code> in the Supabase SQL Editor,
          then reload this page.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={`/admin/submissions?status=${tab.key}`}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              border: `1px solid ${active === tab.key ? T.red : T.border}`,
              background: active === tab.key ? "rgba(249,58,37,0.12)" : T.chip,
              color: active === tab.key ? T.red : T.muted,
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {rows.length === 0 && !migrationMissing && (
        <div
          style={{
            background: T.panel,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: T.muted,
            fontSize: 14,
          }}
        >
          Nothing here yet. Share an intake link from{" "}
          <a href="/admin/restaurants" style={{ color: T.red }}>
            Restaurants
          </a>
          .
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((s) => {
          const draft = s.draft as IntakeDraft;
          return (
            <a
              key={s.id}
              href={`/admin/submissions/${s.id}`}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "center",
                background: T.panel,
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: 14,
                textDecoration: "none",
                color: T.text,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image_url}
                alt=""
                style={{
                  width: 84,
                  height: 56,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
                  {draft?.title ?? "(no title)"}
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>
                  {s.restaurant_name}
                  {s.restaurant_city ? ` · ${s.restaurant_city}` : ""}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                  {draft?.pickup_date ? formatDateLabel(draft.pickup_date) : ""}
                  {draft?.pickup_start_time && draft?.pickup_end_time
                    ? ` · ${formatTimeLabel(draft.pickup_start_time)}–${formatTimeLabel(draft.pickup_end_time)}`
                    : ""}
                  {draft?.price != null ? ` · $${Number(draft.price).toFixed(2)}` : ""}
                  {draft?.total_spots != null ? ` · ${draft.total_spots} spots` : ""}
                </div>
              </div>
              <StatusChip status={s.status} />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: SubmissionStatus }) {
  const color =
    status === "published" ? T.green : status === "rejected" ? T.muted : T.amber;
  const label =
    status === "published" ? "PUBLISHED" : status === "rejected" ? "REJECTED" : "NEEDS REVIEW";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: "4px 10px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
