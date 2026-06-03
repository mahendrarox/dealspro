"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleActive, toggleHero, archiveDrop } from "@/lib/admin/actions";

const T = {
  panel: "#14141A",
  panelAlt: "#1A1A22",
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
  amber: "#D97706",
};

const PLAIN_ARCHIVE_COPY =
  "Archive this drop?\n\nIt will be removed from the default Studio list and hidden from customers.\n\nOrders, customer interactions, consent history, analytics, payment history, and redemption history will be preserved.";

type DropRowProps = {
  archivedView?: boolean;
  drop: {
    id: string;
    title: string;
    restaurant_name: string;
    image_url: string | null;
    price: number;
    total_spots: number;
    spots_remaining: number;
    claimed: number;
    is_active: boolean;
    is_hero: boolean;
    priority: number;
    archived_at?: string | null;
  };
};

// Archive confirmation flow phases.
type Phase = "idle" | "plain" | "strong" | "blocked";

export default function DropRow({ drop, archivedView = false }: DropRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [modalMessage, setModalMessage] = useState<string>("");
  const sold = drop.spots_remaining === 0;

  const onToggleActive = () => {
    setError(null);
    startTransition(async () => {
      const res = await toggleActive(drop.id);
      if (!res.ok) setError(res.error || "Failed to toggle");
    });
  };

  const onToggleHero = () => {
    setError(null);
    startTransition(async () => {
      const res = await toggleHero(drop.id);
      if (!res.ok) setError(res.error || "Failed to toggle");
    });
  };

  // Two-call archive protocol. confirmedImpact starts false; on a
  // requiresConfirmation response we escalate to the strong modal and
  // re-call with confirmedImpact:true. The server re-checks every call.
  const callArchive = (confirmedImpact: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await archiveDrop(drop.id, { confirmedImpact });
      if (res.ok) {
        setPhase("idle");
        router.refresh();
        return;
      }
      if (res.blocked) {
        setModalMessage(res.message || "This drop cannot be archived.");
        setPhase("blocked");
        return;
      }
      if (res.requiresConfirmation) {
        setModalMessage(res.message || "This drop may be visible to customers. Continue?");
        setPhase("strong");
        return;
      }
      setError(res.error || "Could not archive drop");
      setPhase("idle");
    });
  };

  const closeModal = () => {
    if (pending) return;
    setPhase("idle");
    setModalMessage("");
  };

  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gridTemplateColumns: archivedView
          ? "64px 1fr auto auto"
          : "64px 1fr auto auto auto auto auto",
        alignItems: "center",
        gap: 16,
        opacity: drop.archived_at ? 0.85 : 1,
      }}
    >
      {/* Image / fallback */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 8,
          overflow: "hidden",
          background: drop.image_url
            ? "transparent"
            : "linear-gradient(135deg, #1f2937, #374151)",
          flexShrink: 0,
        }}
      >
        {drop.image_url && (
          <img
            src={drop.image_url}
            alt={drop.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </div>

      {/* Title + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {drop.title}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>
          {drop.restaurant_name} · <code style={{ fontSize: 11 }}>{drop.id}</code>
        </div>
        <div style={{ fontSize: 12, color: sold ? T.red : T.muted }}>
          ${drop.price.toFixed(2)} · {drop.claimed}/{drop.total_spots} claimed
          {sold && <span style={{ fontWeight: 700 }}> · SOLD OUT</span>}
        </div>
      </div>

      {archivedView ? (
        <>
          <span
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              color: T.muted,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Archived
          </span>
          <a
            href={`/admin/drops/${drop.id}`}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              color: T.text,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Edit
          </a>
        </>
      ) : (
        <>
          {/* Toggles */}
          <button
            onClick={onToggleActive}
            disabled={pending}
            title="Toggle is_active"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${drop.is_active ? T.green : T.border}`,
              background: drop.is_active ? "rgba(22,163,74,0.1)" : "transparent",
              color: drop.is_active ? T.green : T.muted,
              fontSize: 12,
              fontWeight: 700,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.5 : 1,
              minWidth: 72,
            }}
          >
            {drop.is_active ? "Active" : "Inactive"}
          </button>

          <button
            onClick={onToggleHero}
            disabled={pending}
            title="Toggle is_hero"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${drop.is_hero ? T.amber : T.border}`,
              background: drop.is_hero ? "rgba(217,119,6,0.1)" : "transparent",
              color: drop.is_hero ? T.amber : T.muted,
              fontSize: 12,
              fontWeight: 700,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.5 : 1,
              minWidth: 68,
            }}
          >
            {drop.is_hero ? "Hero" : "—"}
          </button>

          <a
            href={`/admin/drops/${drop.id}`}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              color: T.text,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Edit
          </a>

          <button
            onClick={() => { setError(null); setPhase("plain"); }}
            disabled={pending}
            title="Archive drop"
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: "transparent",
              color: T.muted,
              fontSize: 13,
              fontWeight: 600,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.5 : 1,
            }}
          >
            Archive drop
          </button>
        </>
      )}

      {error && (
        <div style={{ gridColumn: "1 / -1", marginTop: 8, fontSize: 12, color: T.red }}>
          {error}
        </div>
      )}

      {/* ── Archive confirmation modal ── */}
      {phase !== "idle" && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T.panelAlt,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: 24,
              maxWidth: 440,
              width: "100%",
              color: T.text,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
              {phase === "blocked" ? "Can't archive" : phase === "strong" ? "Heads up" : "Archive drop"}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: T.muted, whiteSpace: "pre-line", marginBottom: 20 }}>
              {phase === "plain" ? PLAIN_ARCHIVE_COPY : modalMessage}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {phase === "blocked" ? (
                <button onClick={closeModal} disabled={pending} style={btn(T.border, T.text)}>
                  Close
                </button>
              ) : (
                <>
                  <button onClick={closeModal} disabled={pending} style={btn(T.border, T.muted)}>
                    Cancel
                  </button>
                  <button
                    onClick={() => callArchive(phase === "strong")}
                    disabled={pending}
                    style={btn(T.red, "#fff", T.red)}
                  >
                    {pending ? "Working…" : phase === "strong" ? "Continue" : "Archive"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btn(borderColor: string, color: string, bg?: string) {
  return {
    padding: "9px 16px",
    borderRadius: 8,
    border: `1px solid ${borderColor}`,
    background: bg ?? "transparent",
    color,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  } as const;
}
