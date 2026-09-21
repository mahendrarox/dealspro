"use client";
import { useState, useTransition } from "react";
import { toggleRestaurantActive } from "@/lib/admin/actions";
import { createIntakeLink } from "@/lib/intake/admin-actions";

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

type RestaurantRowProps = {
  restaurant: {
    id: string;
    slug: string;
    name: string;
    city: string;
    tags: string[];
    place_id: string | null;
    is_active: boolean;
  };
};

export default function RestaurantRow({ restaurant: r }: RestaurantRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Private, expiring intake link. Held in state only — never rendered
  // into the page on load and never persisted, so a Studio screenshot or
  // a cached page can't leak a working credential.
  const [intakeLink, setIntakeLink] = useState<string | null>(null);
  const [intakeCopied, setIntakeCopied] = useState(false);

  const smartPath = `/r/${r.slug}`;
  const onCopy = () => {
    const abs =
      typeof window !== "undefined" ? `${window.location.origin}${smartPath}` : smartPath;
    try {
      navigator.clipboard?.writeText(abs);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — non-fatal */
    }
  };

  const onIntakeLink = () => {
    setError(null);
    startTransition(async () => {
      const res = await createIntakeLink(r.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIntakeLink(res.url);
      try {
        await navigator.clipboard?.writeText(res.url);
        setIntakeCopied(true);
        setTimeout(() => setIntakeCopied(false), 2000);
      } catch {
        /* clipboard unavailable — the link is shown below regardless */
      }
    });
  };

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      const res = await toggleRestaurantActive(r.id);
      if (!res.ok) setError(res.error || "Failed to toggle");
    });
  };

  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto auto",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 2 }}>
          {r.name}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>
          {r.city}
          {r.place_id ? (
            <span style={{ color: T.green, marginLeft: 8 }}>· ✓ verified</span>
          ) : (
            <span style={{ color: T.amber, marginLeft: 8 }}>· manual</span>
          )}
        </div>
        {/* Read-only smart URL (stable per restaurant) + copy button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: r.tags.length > 0 ? 6 : 0 }}>
          <code
            style={{
              fontSize: 12,
              color: T.text,
              background: T.chip,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              padding: "2px 8px",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {smartPath}
          </code>
          <button
            onClick={onCopy}
            title="Copy smart URL"
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              border: `1px solid ${T.border}`,
              background: "transparent",
              color: copied ? T.green : T.muted,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        {r.tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {r.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: T.chip,
                  border: `1px solid ${T.border}`,
                  color: T.muted,
                  fontSize: 11,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onToggle}
        disabled={pending}
        title="Toggle is_active"
        style={{
          padding: "6px 12px",
          borderRadius: 8,
          border: `1px solid ${r.is_active ? T.green : T.border}`,
          background: r.is_active ? "rgba(22,163,74,0.1)" : "transparent",
          color: r.is_active ? T.green : T.muted,
          fontSize: 12,
          fontWeight: 700,
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.5 : 1,
          minWidth: 72,
        }}
      >
        {r.is_active ? "Active" : "Inactive"}
      </button>

      <button
        onClick={onIntakeLink}
        disabled={pending || !r.is_active}
        title={
          r.is_active
            ? "Generate a private, expiring drop-submission link for this restaurant"
            : "Activate this restaurant first"
        }
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: "transparent",
          color: r.is_active ? T.text : T.muted,
          fontSize: 13,
          fontWeight: 600,
          cursor: pending || !r.is_active ? "default" : "pointer",
          opacity: pending ? 0.5 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {intakeCopied ? "Copied \u2713" : "Intake link"}
      </button>

      <a
        href={`/admin/restaurants/${r.id}/edit`}
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

      <span />

      {intakeLink && (
        <div
          style={{
            gridColumn: "1 / -1",
            marginTop: 10,
            padding: "10px 12px",
            background: T.chip,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 11, color: T.amber, fontWeight: 700, marginBottom: 6 }}>
            PRIVATE LINK — anyone holding it can submit drops for {r.name}. Send it
            directly to the restaurant. It expires in 14 days.
          </div>
          <input
            readOnly
            value={intakeLink}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: `1px solid ${T.border}`,
              background: "#0A0A0A",
              color: T.text,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        </div>
      )}

      {error && (
        <div style={{ gridColumn: "1 / -1", marginTop: 8, fontSize: 12, color: T.red }}>
          {error}
        </div>
      )}
    </div>
  );
}
