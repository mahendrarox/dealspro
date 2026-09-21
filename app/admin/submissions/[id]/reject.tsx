"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rejectSubmission } from "@/lib/intake/admin-actions";

/**
 * Reject a submission without publishing it.
 *
 * Rejection only changes the submission's own status — it never creates,
 * edits, or hides a drop, because no drop exists for an unpublished
 * submission in the first place.
 */

const T = {
  border: "#27272A",
  text: "#F4F4F5",
  muted: "#A1A1AA",
  red: "#F93A25",
  input: "#0A0A0A",
};

export default function RejectSubmission({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 20,
          background: "none",
          border: "none",
          color: T.muted,
          fontSize: 13,
          textDecoration: "underline",
          cursor: "pointer",
          padding: 0,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Reject this submission instead
      </button>
    );
  }

  return (
    <div
      style={{
        marginTop: 20,
        padding: 16,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
      }}
    >
      <label
        style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}
      >
        Why is this being rejected? (internal note, optional)
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="e.g. photo looks like stock imagery"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: T.input,
          color: T.text,
          fontSize: 14,
          fontFamily: "'DM Sans', sans-serif",
        }}
      />
      {error && <div style={{ fontSize: 11, color: T.red, marginTop: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await rejectSubmission(submissionId, note);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push("/admin/submissions");
            });
          }}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: T.red,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: pending ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {pending ? "Rejecting…" : "Confirm reject"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.muted,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
