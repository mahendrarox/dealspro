"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  channelResultsForDrop,
  createChannel,
  listChannels,
  recordChannelCopy,
  renameChannel,
  setChannelActive,
  shareLinkFor,
  type Channel,
  type ChannelResultsPayload,
} from "@/lib/admin/channels";

/**
 * Share panel for one drop.
 *
 * The governing fact: every channel link opens the SAME drop, at the
 * same price, against the same inventory and the same pickup terms.
 * Choosing a channel changes the `?tag=` and nothing else. Nothing here
 * creates a drop, allocates stock or touches a price — the panel reads
 * the registry and derives a URL.
 *
 * A channel's code is generated from its display name and is never shown
 * as an editable field. The operator types "Frisco WhatsApp"; the link
 * says `?tag=frisco-whatsapp`. Renaming later changes the name on screen
 * and leaves every link and every attributed order untouched.
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Best-effort clipboard write. Returns whether it actually landed. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SharePanel({
  dropId,
  dropTitle,
}: {
  dropId: string;
  dropTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // channel code
  const [url, setUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ChannelResultsPayload | null>(null);
  const [showRetired, setShowRetired] = useState(false);
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
      const [list, res] = await Promise.all([
        listChannels(),
        channelResultsForDrop(dropId),
      ]);
      if (!list.ok) {
        setError(list.error);
        return;
      }
      setChannels(list.channels);
      setMigrationMissing(list.migrationMissing);
      if (res.ok) setResults(res.results);
      setLoaded(true);
    });
  }, [dropId]);

  useEffect(() => {
    if (open && !loaded) refresh();
  }, [open, loaded, refresh]);

  // The URL is derived, never minted: asking again for the same drop and
  // channel always returns the same string.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void shareLinkFor(dropId, selected).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setUrl(res.url);
        setError(null);
      } else {
        setUrl("");
        setError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, dropId, selected]);

  const activeChannels = channels.filter((c) => c.isActive);
  const retiredChannels = channels.filter((c) => !c.isActive);

  const flashCopied = () => {
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  };

  /**
   * Copy. Feedback appears ONLY after the clipboard write resolves —
   * a button that says "Copied" when nothing was copied is worse than
   * one that says nothing.
   */
  const onCopy = () => {
    setError(null);
    setManualUrl(null);
    if (!url) return;
    startTransition(async () => {
      const ok = await copyToClipboard(url);
      if (!ok) {
        // Clipboard blocked (insecure context, denied permission).
        // Give them something they can select instead of a dead button.
        setManualUrl(url);
        return;
      }
      flashCopied();
      let eventId: string | null = null;
      try {
        eventId = crypto.randomUUID();
      } catch {
        eventId = null;
      }
      if (eventId) {
        // Recorded only because the copy succeeded. Still not evidence
        // the link reached anybody. Failure here costs a count, not a
        // copy — the link is already on the clipboard.
        await recordChannelCopy(dropId, selected, eventId);
        refresh();
      }
    });
  };

  const onOpen = () => {
    if (!url) return;
    const tab = window.open(url, "_blank", "noopener,noreferrer");
    if (!tab) setManualUrl(url); // pop-up blocked
  };

  const onAdd = () => {
    setError(null);
    const label = newLabel.trim();
    if (!label) return;
    startTransition(async () => {
      const res = await createChannel(label);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewLabel("");
      setSelected(res.channel.code);
      refresh();
    });
  };

  const onRename = (id: string) => {
    setError(null);
    const label = renameLabel.trim();
    if (!label) return;
    startTransition(async () => {
      const res = await renameChannel(id, label);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRenaming(null);
      setRenameLabel("");
      refresh();
    });
  };

  const onToggle = (id: string, next: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await setChannelActive(id, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Retiring the channel currently selected falls back to no tag,
      // so the operator cannot keep copying a link for a retired one.
      if (!next && selected && channels.find((c) => c.id === id)?.code === selected) {
        setSelected(null);
      }
      refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Share this drop through a channel"
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: "transparent",
          color: T.text,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          fontFamily: font,
        }}
      >
        Share
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <strong style={{ fontSize: 13, color: T.text }}>Share · {dropTitle}</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: T.muted,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: font,
          }}
        >
          Close
        </button>
      </div>

      {migrationMissing && (
        <div style={{ fontSize: 12, color: T.amber, marginBottom: 10, lineHeight: 1.5 }}>
          <strong>Channels are not available yet.</strong> Apply{" "}
          <code>migration-013-share-channels.sql</code>, then reopen this panel. The
          untagged link below still works.
        </div>
      )}

      {results?.tagColumnMissing && (
        <div style={{ fontSize: 12, color: T.amber, marginBottom: 10, lineHeight: 1.5 }}>
          <strong>Orders carry no channel.</strong> <code>migration-012-order-tag.sql</code>{" "}
          has not been applied, so every order below reports as Untagged regardless of the
          link it came through.
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: T.red, marginBottom: 10, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* ── The link ───────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontWeight: 700, letterSpacing: "0.05em" }}>
        CHANNEL
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value || null)}
          disabled={pending}
          style={{
            padding: "7px 10px",
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: T.input,
            color: T.text,
            fontSize: 13,
            fontFamily: font,
            minWidth: 200,
          }}
        >
          <option value="">No channel (untagged link)</option>
          {activeChannels.map((c) => (
            <option key={c.id} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>

        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Add a channel — e.g. Frisco WhatsApp"
          maxLength={120}
          disabled={pending || migrationMissing}
          style={{
            padding: "7px 10px",
            borderRadius: 6,
            border: `1px solid ${T.border}`,
            background: T.input,
            color: T.text,
            fontSize: 13,
            fontFamily: font,
            flex: 1,
            minWidth: 200,
          }}
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={pending || migrationMissing || !newLabel.trim()}
          style={btn(T.text)}
        >
          Add
        </button>
      </div>

      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: `1px solid ${T.border}`,
          background: T.input,
          color: T.text,
          fontSize: 13,
          fontFamily: mono,
          marginBottom: 8,
        }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <button
          type="button"
          onClick={onCopy}
          disabled={pending || !url}
          style={{
            padding: "7px 14px",
            borderRadius: 6,
            border: "none",
            background: copied ? T.green : T.red,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: font,
          }}
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <button type="button" onClick={onOpen} disabled={!url} style={btn(T.text)}>
          Open link ↗
        </button>
        <span style={{ fontSize: 11, color: T.muted }}>
          Same drop, price and inventory for every channel — only attribution differs.
        </span>
      </div>

      {manualUrl && (
        <div style={{ fontSize: 11, color: T.amber, marginBottom: 8, lineHeight: 1.5 }}>
          Your browser blocked the clipboard. Select the link above and copy it manually.
        </div>
      )}

      {/* ── Manage channels ────────────────────────────────────────── */}
      {channels.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: T.muted, cursor: "pointer", fontFamily: font }}>
            Manage channels ({activeChannels.length} active
            {retiredChannels.length > 0 ? `, ${retiredChannels.length} retired` : ""})
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {[...activeChannels, ...retiredChannels].map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "6px 10px",
                  background: T.input,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {renaming === c.id ? (
                  <>
                    <input
                      value={renameLabel}
                      onChange={(e) => setRenameLabel(e.target.value)}
                      maxLength={120}
                      autoFocus
                      style={{
                        padding: "4px 8px",
                        borderRadius: 5,
                        border: `1px solid ${T.border}`,
                        background: "#000",
                        color: T.text,
                        fontSize: 12,
                        fontFamily: font,
                      }}
                    />
                    <button type="button" onClick={() => onRename(c.id)} style={rowBtn(T.green)}>
                      Save
                    </button>
                    <button type="button" onClick={() => setRenaming(null)} style={rowBtn(T.muted)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ color: c.isActive ? T.text : T.muted, fontWeight: 600 }}>
                      {c.label}
                    </span>
                    <code style={{ color: T.muted, fontFamily: mono, fontSize: 11 }}>
                      ?tag={c.code}
                    </code>
                    {!c.isActive && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          color: T.muted,
                          border: `1px solid ${T.border}`,
                          borderRadius: 999,
                          padding: "1px 7px",
                        }}
                      >
                        RETIRED
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(c.id);
                        setRenameLabel(c.label);
                      }}
                      disabled={pending}
                      style={rowBtn(T.text)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggle(c.id, !c.isActive)}
                      disabled={pending}
                      style={rowBtn(c.isActive ? T.amber : T.green)}
                    >
                      {c.isActive ? "Retire" : "Restore"}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
            A code never changes. Renaming updates the name only — existing links and
            every order already attributed keep working. Retiring hides a channel from
            new selections and deletes nothing.
          </div>
        </details>
      )}

      {/* ── Results ────────────────────────────────────────────────── */}
      <Results results={results} loaded={loaded} showRetired={showRetired} onToggleRetired={() => setShowRetired((v) => !v)} />
    </div>
  );
}

function Results({
  results,
  loaded,
  showRetired,
  onToggleRetired,
}: {
  results: ChannelResultsPayload | null;
  loaded: boolean;
  showRetired: boolean;
  onToggleRetired: () => void;
}) {
  if (!loaded) return <div style={{ fontSize: 12, color: T.muted, marginTop: 14 }}>Loading…</div>;
  if (!results) return null;

  const visible = results.rows.filter(
    (r) =>
      showRetired ||
      r.isActive ||
      !r.isRegistered ||
      r.isUntagged ||
      r.paidOrders > 0 ||
      r.visits > 0 ||
      r.copies > 0,
  );

  const measured = results.eventsTracked;
  const cell: React.CSSProperties = {
    padding: "6px 8px",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
  const head: React.CSSProperties = { ...cell, color: T.muted, fontWeight: 700, fontSize: 10, letterSpacing: "0.04em" };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 12, color: T.text }}>Results by channel</strong>
        <span style={{ fontSize: 11, color: T.muted }}>
          Attribution — which link a buyer arrived through. Not proof of incremental sales.
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onToggleRetired}
          style={{ background: "none", border: "none", color: T.muted, fontSize: 11, cursor: "pointer", fontFamily: font, padding: 0 }}
        >
          {showRetired ? "Hide empty retired" : "Show all"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: T.text }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              <th style={{ ...head, textAlign: "left" }}>CHANNEL</th>
              <th style={head}>COPIES</th>
              <th style={head}>VISITS</th>
              <th style={head}>CHECKOUTS</th>
              <th style={head}>PAID</th>
              <th style={head}>PACKS</th>
              <th style={head}>PICKED UP</th>
              <th style={head}>ORDER VALUE</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: "6px 8px", color: r.isActive || r.isUntagged ? T.text : T.muted }}>
                  {r.label}
                  {!r.isRegistered && !r.isUntagged && (
                    <span style={{ color: T.amber, fontSize: 10, marginLeft: 6 }}>UNKNOWN TAG</span>
                  )}
                  {r.isRegistered && !r.isActive && (
                    <span style={{ color: T.muted, fontSize: 10, marginLeft: 6 }}>RETIRED</span>
                  )}
                </td>
                <td style={cell}>{measured ? r.copies : "—"}</td>
                <td style={cell}>{measured ? r.visits : "—"}</td>
                <td style={cell}>{measured ? r.checkoutSessions : "—"}</td>
                <td style={cell}>{r.paidOrders}</td>
                <td style={cell}>{r.packsOrdered}</td>
                <td style={cell}>{r.pickedUpOrders}</td>
                <td style={cell}>{money(r.recordedValueBeforeRefunds)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${T.border}`, fontWeight: 700 }}>
              <td style={{ padding: "6px 8px" }}>Total</td>
              <td style={cell}>{measured ? results.totals.copies : "—"}</td>
              <td style={cell}>{measured ? results.totals.visits : "—"}</td>
              <td style={cell}>{measured ? results.totals.checkoutSessions : "—"}</td>
              <td style={cell}>{results.totals.paidOrders}</td>
              <td style={cell}>{results.totals.packsOrdered}</td>
              <td style={cell}>{results.totals.pickedUpOrders}</td>
              <td style={cell}>{money(results.totals.recordedValueBeforeRefunds)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Everything a reader needs in order not to over-read the table. */}
      <ul style={{ fontSize: 11, color: T.muted, lineHeight: 1.6, marginTop: 10, paddingLeft: 18 }}>
        <li>
          <strong>Order value</strong> is recorded order value <strong>before refunds</strong>.
          Not net revenue, and not verified Stripe collections.
        </li>
        <li>
          <strong>Refunds are not reported.</strong> Nothing in this product records a refund
          against an order, so refunded orders are still counted above.
        </li>
        <li>
          {measured ? (
            <>
              Copies, visits and checkouts are measured from{" "}
              <strong>{fmtDate(results.measuredSince)}</strong>. Anything before that was
              never measured — it is not zero.
            </>
          ) : (
            <>
              Copies, visits and checkouts are <strong>not tracked</strong> on this server.
              The dashes above mean no measurement exists, not zero.
            </>
          )}
        </li>
        <li>
          A <strong>copy</strong> is a clipboard write, not proof the link was shared. A{" "}
          <strong>visit</strong> is a page that rendered — not a unique person and not reach.
          A <strong>checkout</strong> is a Stripe session created, not a payment.
        </li>
        <li>
          <strong>Packs</strong> counts items; <strong>paid</strong> counts orders. One order
          can be up to four packs.
        </li>
      </ul>
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
    padding: "3px 9px",
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
