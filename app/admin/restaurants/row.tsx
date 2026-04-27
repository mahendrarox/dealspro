"use client";
import { useState, useTransition } from "react";
import { toggleRestaurantActive } from "@/lib/admin/actions";

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
        gridTemplateColumns: "1fr auto auto auto",
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

      {error && (
        <div style={{ gridColumn: "1 / -1", marginTop: 8, fontSize: 12, color: T.red }}>
          {error}
        </div>
      )}
    </div>
  );
}
