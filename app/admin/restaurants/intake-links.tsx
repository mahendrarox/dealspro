"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createIntakeLink,
  listIntakeLinks,
  replaceIntakeLink,
  revealIntakeLink,
  revokeAllIntakeLinks,
  revokeIntakeLink,
  type LinkSummary,
  type MintedLink,
} from "@/lib/intake/admin-actions";

/**
 * Intake-link management for one restaurant.
 *
 * An ACTIVE link can be copied or opened again at any time: the code is
 * stored encrypted server-side, and `revealIntakeLink` decrypts it for an
 * authenticated admin. That exists because the alternative — Replace —
 * invalidates every other credential the partner holds, which is far too
 * blunt an instrument for "I closed the tab".
 *
 * Three states an operator has to be able to tell apart at a glance:
 *
 *   * ACTIVE with a stored copy → Copy link / Open form work.
 *   * ACTIVE without one (minted before this feature, or while the key
 *     was unset) → copying is impossible; the only route is a deliberate
 *     Replace, and the confirmation says what that costs.
 *   * EXPIRED or REVOKED → labelled, buttons gone. Nothing to copy.
 *
 * The browser never receives a ciphertext or a hash. It receives a URL
 * only in direct response to a click, and that URL is held in state only
 * long enough to reach the clipboard or a new tab.
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
const mono = "'JetBrains Mono', monospace";

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

/** "in 13 days" / "in 4 hours" / "expired". Rounded down, never negative. */
function untilLabel(iso: string, now: number = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `in ${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (hours < 48) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${Math.floor(hours / 24)} days`;
}

/**
 * Make sure what reaches the clipboard or a new tab is a full URL.
 *
 * The server builds it from NEXT_PUBLIC_APP_URL; if that is unset it
 * returns a site-relative path, which is fine inside the app and useless
 * in a text message to a restaurant. Studio is served from the same
 * origin the partner will use, so resolving here is correct and costs
 * nothing when the server already sent an absolute URL.
 */
function absolutize(url: string): string {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

/** Best-effort clipboard write. Returns whether it landed. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
  const [cryptoConfigured, setCryptoConfigured] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [minted, setMinted] = useState<MintedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  /** Per-row transient state: which row was just copied, or is busy. */
  const [rowCopied, setRowCopied] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  /** Which legacy row has its replacement confirmation expanded. */
  const [confirmRowReplace, setConfirmRowReplace] = useState<string | null>(null);
  /** Manual fallback when the clipboard API is unavailable or denied. */
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await listIntakeLinks(restaurantId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLinks(res.links);
      setMigrationMissing(res.migrationMissing);
      setCryptoConfigured(res.cryptoConfigured);
      setLoaded(true);
    });
  }, [restaurantId]);

  useEffect(() => {
    if (open && !loaded) refresh();
  }, [open, loaded, refresh]);

  const activeCount = links.filter((l) => l.status === "active").length;

  const flashCopied = (linkId: string | null) => {
    setRowCopied(linkId);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setRowCopied(null), 2500);
  };

  const reveal = (link: MintedLink) => {
    setMinted(link);
    setCopied(false);
    setConfirmReplace(false);
    setManualUrl(null);
    void copyToClipboard(absolutize(link.url)).then(setCopied);
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
      setConfirmRowReplace(null);
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

  /**
   * Copy an existing link's URL. Reveals, writes to the clipboard, and
   * drops the URL — nothing is rendered unless the clipboard refused it,
   * in which case the operator gets a select-and-copy field instead of a
   * dead button.
   */
  const onCopyExisting = (linkId: string) => {
    setError(null);
    setManualUrl(null);
    setRowBusy(linkId);
    startTransition(async () => {
      const res = await revealIntakeLink(linkId, restaurantId);
      setRowBusy(null);
      if (!res.ok) {
        setError(res.error);
        if (res.needsReplacement) setConfirmRowReplace(linkId);
        refresh();
        return;
      }
      const full = absolutize(res.url);
      const ok = await copyToClipboard(full);
      if (ok) flashCopied(linkId);
      else setManualUrl(full);
    });
  };

  /**
   * Open the partner-facing form in a new tab.
   *
   * The tab is opened SYNCHRONOUSLY on the click and navigated once the
   * URL comes back — a window opened after an await is what pop-up
   * blockers exist to stop, and the operator would just see nothing
   * happen. `opener` is cleared so the new tab cannot reach back into
   * Studio.
   */
  const onOpenExisting = (linkId: string) => {
    setError(null);
    setManualUrl(null);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setRowBusy(linkId);
    startTransition(async () => {
      const res = await revealIntakeLink(linkId, restaurantId);
      setRowBusy(null);
      if (!res.ok) {
        tab?.close();
        setError(res.error);
        if (res.needsReplacement) setConfirmRowReplace(linkId);
        refresh();
        return;
      }
      const full = absolutize(res.url);
      if (tab) tab.location.replace(full);
      else setManualUrl(full); // pop-up blocked — let them copy it
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

      {!migrationMissing && !cryptoConfigured && loaded && (
        <div style={{ fontSize: 12, color: T.amber, marginBottom: 10, lineHeight: 1.5 }}>
          <strong>Copying is switched off.</strong> <code>INTAKE_LINK_ENC_KEY</code> is not set on
          this server, so new links cannot be stored for later retrieval. Links still work —
          they just have to be saved when they are created.
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: T.red, marginBottom: 10, lineHeight: 1.5 }}>{error}</div>
      )}

      {/* ── Clipboard fallback ─────────────────────────────────────── */}
      {manualUrl && (
        <div
          style={{
            marginBottom: 12, padding: 10, borderRadius: 8,
            border: `1px solid ${T.border}`, background: T.input,
          }}
        >
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>
            Your browser blocked the clipboard. Select and copy this instead:
          </div>
          <input
            readOnly
            value={manualUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: `1px solid ${T.border}`, background: "#000", color: T.text,
              fontSize: 13, fontFamily: mono,
            }}
          />
          <button
            type="button"
            onClick={() => setManualUrl(null)}
            style={{
              marginTop: 6, background: "none", border: "none", color: T.muted,
              fontSize: 11, cursor: "pointer", fontFamily: font, padding: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Freshly minted link ────────────────────────────────────── */}
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
            {cryptoConfigured
              ? `New link for ${restaurantName}. Anyone holding it can submit drops for this restaurant. Expires ${fmt(minted.expiresAt)} CT — you can copy it again later from the list below.`
              : `COPY THIS NOW — it is shown once and cannot be retrieved later. Anyone holding it can submit drops for ${restaurantName}. Expires ${fmt(minted.expiresAt)} CT.`}
          </div>
          <input
            readOnly
            value={minted.url}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: `1px solid ${T.border}`, background: T.input, color: T.text,
              fontSize: 13, fontFamily: mono,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => void copyToClipboard(absolutize(minted.url)).then(setCopied)}
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

      {confirmReplace && (
        <div style={{ fontSize: 11, color: T.amber, marginBottom: 12, lineHeight: 1.5 }}>
          Replace revokes <strong>every</strong> link {restaurantName} currently holds — including
          any older <code>/intake/</code> link — and issues one new link. Anyone using an old link
          will be locked out on their next click.
        </div>
      )}

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
                padding: "8px 10px", background: T.input,
                border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <code style={{ color: T.text, fontFamily: mono }}>/i/{l.prefix}…</code>
                <StatusPill status={l.status} replaced={l.wasReplaced} />
                <span style={{ color: l.status === "active" ? T.muted : T.amber }}>
                  {l.status === "active"
                    ? `expires ${fmt(l.expiresAt)} (${untilLabel(l.expiresAt)})`
                    : `expired ${fmt(l.expiresAt)}`}
                </span>
                <span style={{ color: T.muted }}>
                  {l.lastUsedAt ? `opened ${fmt(l.lastUsedAt)}` : "never opened"}
                </span>
                <span style={{ color: T.muted }}>
                  {l.useCount} submission{l.useCount === 1 ? "" : "s"}
                </span>

                <span style={{ flex: 1 }} />

                {l.canCopy && (
                  <>
                    <button
                      type="button"
                      onClick={() => onCopyExisting(l.id)}
                      disabled={pending || rowBusy === l.id}
                      style={rowBtn(rowCopied === l.id ? T.green : T.text)}
                    >
                      {rowCopied === l.id ? "Copied ✓" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenExisting(l.id)}
                      disabled={pending || rowBusy === l.id}
                      style={rowBtn(T.text)}
                      title="Opens the partner's submission form in a new tab"
                    >
                      Open form ↗
                    </button>
                  </>
                )}

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

              {/* Legacy hash-only row: copying is impossible, and the
                  only way to change that costs the partner every other
                  link they hold. Say so before they click, not after. */}
              {l.needsReplacementToCopy && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ color: T.amber, lineHeight: 1.5 }}>
                    This older link needs a one-time replacement to enable copying.
                  </div>
                  {confirmRowReplace !== l.id ? (
                    <button
                      type="button"
                      onClick={() => setConfirmRowReplace(l.id)}
                      disabled={pending}
                      style={{ ...rowBtn(T.amber), marginTop: 6 }}
                    >
                      Replace this link…
                    </button>
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: T.muted, lineHeight: 1.5, marginBottom: 6 }}>
                        Replacing revokes <strong>every</strong> link {restaurantName} currently
                        holds — all {activeCount} of them, plus any older <code>/intake/</code>{" "}
                        link — and issues one new link you can copy. Anyone still using an old
                        link will be locked out on their next click. This cannot be undone.
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={onReplace}
                          disabled={pending}
                          style={rowBtn(T.red)}
                        >
                          Yes — revoke {activeCount} and issue a new link
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRowReplace(null)}
                          disabled={pending}
                          style={rowBtn(T.muted)}
                        >
                          Keep the current link
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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

function rowBtn(color: string): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 5,
    border: `1px solid ${color === T.text ? T.border : color}`,
    background: "transparent",
    color,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: font,
    whiteSpace: "nowrap",
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
