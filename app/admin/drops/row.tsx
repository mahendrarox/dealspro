"use client";
import { useState, useTransition } from "react";
import { toggleActive, toggleHero } from "@/lib/admin/actions";

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

type DropRowProps = {
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
  };
};

export default function DropRow({ drop }: DropRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gridTemplateColumns: "64px 1fr auto auto auto auto",
        alignItems: "center",
        gap: 16,
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

      <span style={{ fontSize: 12, color: T.muted, minWidth: 40, textAlign: "right" }}>
        p{drop.priority}
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

      {error && (
        <div style={{ gridColumn: "1 / -1", marginTop: 8, fontSize: 12, color: T.red }}>
          {error}
        </div>
      )}
    </div>
  );
}
