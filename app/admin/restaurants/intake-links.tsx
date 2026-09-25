"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  createIntakeLink,
  listIntakeLinks,
  replaceIntakeLink,
  revokeAllIntakeLinks,
  revokeIntakeLink,
  type LinkSummary,
  type MintedLink,
} from "@/lib/intake/admin-actions";

/**
 * Intake-link management for one restaurant.
 *
 * The governing constraint: a link's code is shown EXACTLY ONCE, at the
 * moment it is minted. Only its SHA-256 is stored, so there is no "show
 * it to me again" — a lost link is replaced, not recovered. The UI has
 * to make that obvious rather than let an operator close the panel and
 * discover the link is gone.
 *
 * Everything else here (the list, revoke, replace) reads or writes only
 * metadata: prefix, status, expiry, usage. No code and no hash is ever
 * sent to the browser after the one reveal.
 */

const T = {
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  green: "#16A34A",
  amber: "#D97706",
  chip: "#1F1F26",
  input: "#0A0A0A",
};

const font = "'DM Sans', sans-serif";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function IntakeLinks({
  restaurantId,
  restaurantName,
  isActive,
}: {
  restaurantId: string;
  restaurantName: string;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [minted, setMinted] = useState<MintedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await listIntakeLinks(restaurantId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLinks(res.links);
      setMigrationMissing(res.migrationMissing);
      setLoaded(true);
    });
  }, [restaurantId]);

  useEffect(() => {
    if (open && !loaded) refresh();
  }, [open, loaded, refresh]);

  const activeCount = links.filter((l) => l.status === "active").length;

  const reveal = (link: MintedLink) => {
    setMinted(link);
    setCopied(false);
    setConfirmReplace(false);
    try {
      navigator.clipboard?.writeText(link.url);
      setCopied(true);
    } catch {
      /* clipboard unavailable — the link is shown below regardless */
    }
    refresh();
  };

  const onCreate = () => {
    setError(null);
    startTransition(async () => {
      const res = await createIntakeLink(restaurantId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reveal(res.link);
    });
  };

  const onReplace = () => {
    setError(null);
    startTransition(async () => {
      const res = await replaceIntakeLink(restaurantId);
      if (!res.ok) {
        setError(res.error);
        refresh();
        return;
      }
      reveal(res.link);
    });
  };

  const onRevokeOne = (linkId: string) => {
    setError(null);
    startTransition(async () => {
      const res = await revokeIntakeLink(linkId, restaurantId);
      if (!res.ok) setError(res.error);
      refresh();
    });
  };

  const onRevokeAll = () => {
    setError(null);
    startTransition(async () => {
      const res = await revokeAllIntakeLinks(restaurantId);
      if (!res.ok) setError(res.error);
      setMinted(null);
      refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!isActive}
        title={isActive ? "Manage private intake links" : "Activate this restaurant first"}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: "transparent",
          color: isActive ? T.text : T.muted,
          fontSize: 13,
          fontWeight: 600,
          cursor: isActive ? "pointer" : "default",
          whiteSpace: "nowrap",
          fontFamily: font,
        }}
      >
        Intake links
      </button>
    );
  }

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        marginTop: 12,
        padding: 14,
        background: T.chip,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13, color: T.text }}>
          Intake links · {restaurantName}
        </strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: T.muted,
            fontSize: 12, cursor: "pointer", fontFamily: font,
          }}
        >
          Close
        </button>
      </div>

      {migrationMissing && (
        <div style={{ fontSize: 12, color: T.amber, marginBottom: 10, lineHeight: 1.5 }}>
          <strong>Not available yet.</strong> Apply <code>migration-010-intake-links.sql</code>,
          then reopen this panel.
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: T.red, marginBottom: 10 }}>{error}</div>
      )}

      {/* ── The one reveal ─────────────────────────────────────────── */}
      {minted && (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            border: `1px solid ${T.amber}`,
            borderRadius: 8,
            background: "rgba(217,119,6,0.10)",
          }}
        >
          <div style={{ fontSize: 11, color: T.amber, fontWeight: 700, marginBottom: 6, lineHeight: 1.5 }}>
            COPY THIS NOW — it is shown once and cannot be retrieved later.
            Anyone holding it can submit drops for {restaurantName}. Expires{" "}
            {fmt(minted.expiresAt)} CT.
          </div>
          <input
            readOnly
            value={minted.url}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: `1px solid ${T.border}`, background: T.input, color: T.text,
              fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(minted.url);
                  setCopied(true);
                } catch { /* non-fatal */ }
              }}
              style={{
                padding: "6px 12px", borderRadius: 6, border: "none",
                background: T.red, color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: font,
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setMinted(null)}
              style={{
                padding: "6px 12px", borderRadius: 6,
                border: `1px solid ${T.border}`, background: "transparent",
                color: T.muted, fontSize: 12, cursor: "pointer", fontFamily: font,
              }}
            >
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          onClick={onCreate}
          disabled={pending || migrationMissing}
          style={btn(T.text)}
        >
          {activeCount === 0 ? "Create link" : "Create another"}
        </button>

        {activeCount > 0 && !confirmReplace && (
          <button
            type="button"
            onClick={() => setConfirmReplace(true)}
            disabled={pending || migrationMissing}
            style={btn(T.amber)}
          >
            Replace…
          </button>
        )}
        {confirmReplace && (
          <>
            <button type="button" onClick={onReplace} disabled={pending} style={btn(T.red)}>
              Revoke {activeCount} &amp; issue new
            </button>
            <button
              type="button"
              onClick={() => setConfirmReplace(false)}
              disabled={pending}
              style={btn(T.muted)}
            >
              Cancel
            </button>
          </>
        )}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onRevokeAll}
            disabled={pending || migrationMissing}
            style={btn(T.muted)}
          >
            Revoke all
          </button>
        )}
      </div>

      {/* ── Existing links ────────────────────────────────────────── */}
      {!loaded && <div style={{ fontSize: 12, color: T.muted }}>Loading…</div>}

      {loaded && links.length === 0 && !migrationMissing && (
        <div style={{ fontSize: 12, color: T.muted }}>
          No links yet for this restaurant.
        </div>
      )}

      {links.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {links.map((l) => (
            <div
              key={l.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "8px 10px", background: T.input,
                border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12,
              }}
            >
              <code style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
                /i/{l.prefix}…
              </code>
              <StatusPill status={l.status} replaced={l.wasReplaced} />
              <span style={{ color: T.muted }}>
                expires {fmt(l.expiresAt)}
              </span>
              <span style={{ color: T.muted }}>
                {l.lastUsedAt ? `opened ${fmt(l.lastUsedAt)}` : "never opened"}
              </span>
              <span style={{ color: T.muted }}>
                {l.useCount} submission{l.useCount === 1 ? "" : "s"}
              </span>
              <span style={{ flex: 1 }} />
              {l.status === "active" && (
                <button
                  type="button"
                  onClick={() => onRevokeOne(l.id)}
                  disabled={pending}
                  style={{
                    background: "none", border: "none", color: T.red,
                    fontSize: 12, textDecoration: "underline", cursor: "pointer",
                    padding: 0, fontFamily: font,
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    padding: "7px 12px",
    borderRadius: 6,
    border: `1px solid ${color === T.text ? T.border : color}`,
    background: "transparent",
    color,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: font,
  };
}

function StatusPill({ status, replaced }: { status: LinkSummary["status"]; replaced: boolean }) {
  const color =
    status === "active" ? T.green : status === "revoked" ? T.muted : T.amber;
  const label =
    status === "active" ? "ACTIVE" : status === "revoked" ? (replaced ? "REPLACED" : "REVOKED") : "EXPIRED";
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color,
        border: `1px solid ${color}`, borderRadius: 999, padding: "2px 8px",
      }}
    >
      {label}
    </span>
  );
}
