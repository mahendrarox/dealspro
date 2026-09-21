import {
  missingRequiredFields,
  type ExtractedDraft,
  type RequiredDraftField,
} from "./schemas";

/**
 * The follow-up questions, derived DETERMINISTICALLY from which required
 * fields are still null.
 *
 * The model does not author these. It reports what it heard; this module
 * decides what is still missing and how to ask for it. That split matters:
 * a model-authored question could invent a premise ("Is this the usual
 * $14 biryani?") and lead the restaurant into confirming something it
 * never said.
 *
 * Every question offers tappable options plus a free-text escape, so the
 * common case is two taps on a phone and the uncommon case is still
 * answerable.
 */

export type QuestionOption = { label: string; value: string };

export type IntakeQuestion = {
  field: RequiredDraftField;
  prompt: string;
  helper?: string;
  options: QuestionOption[];
  /** Free-text fallback shown under the options. */
  allowCustom: boolean;
  customPlaceholder?: string;
  /** Hint for the mobile keyboard / input type. */
  inputMode: "text" | "decimal" | "numeric";
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Add whole days to a `YYYY-MM-DD` string. Pure date math, no timezone. */
export function addDaysToDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Add minutes to an `HH:MM` string, clamped to the same day (23:59 max). */
export function addMinutesToTime(hm: string, minutes: number): string {
  const [h, m] = hm.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** "Friday, Mar 28" for a plain date string — no Date-parsing timezone trap. */
export function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Construct at UTC noon and format in UTC: the value is a wall-clock
  // date with no instant attached, so any zone conversion would be a bug.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "5:00 PM" for an `HH:MM` wall-clock string. */
export function formatTimeLabel(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${meridiem}` : `${hour12}:${pad(m)} ${meridiem}`;
}

/**
 * Questions for everything still missing, in a sensible asking order.
 *
 * Call this again after each answer: later questions depend on earlier
 * answers (the pickup-end options are offsets from the answered start
 * time), so the list is always derived from the current draft rather
 * than computed once up front.
 */
export function buildQuestions(
  draft: Partial<ExtractedDraft>,
  anchorDate: string,
): IntakeQuestion[] {
  const missing = missingRequiredFields(draft);
  const questions: IntakeQuestion[] = [];

  if (missing.includes("title")) {
    questions.push({
      field: "title",
      prompt: "What are you offering?",
      helper: "This is the headline customers see.",
      options: [],
      allowCustom: true,
      customPlaceholder: "e.g. Chicken Biryani Box",
      inputMode: "text",
    });
  }

  if (missing.includes("price")) {
    questions.push({
      field: "price",
      prompt: "What's the DealsPro price per portion?",
      options: [8, 10, 12, 15, 18].map((p) => ({ label: `$${p}`, value: String(p) })),
      allowCustom: true,
      customPlaceholder: "Other amount",
      inputMode: "decimal",
    });
  }

  if (missing.includes("total_spots")) {
    questions.push({
      field: "total_spots",
      prompt: "How many portions are available?",
      options: [5, 7, 10, 15, 20].map((n) => ({ label: String(n), value: String(n) })),
      allowCustom: true,
      customPlaceholder: "Other quantity",
      inputMode: "numeric",
    });
  }

  if (missing.includes("pickup_date")) {
    questions.push({
      field: "pickup_date",
      prompt: "Which day is pickup?",
      options: [0, 1, 2, 3].map((offset) => {
        const value = addDaysToDate(anchorDate, offset);
        const label =
          offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : formatDateLabel(value);
        return { label, value };
      }),
      allowCustom: true,
      customPlaceholder: "YYYY-MM-DD",
      inputMode: "text",
    });
  }

  if (missing.includes("pickup_start_time")) {
    questions.push({
      field: "pickup_start_time",
      prompt: "When does pickup start?",
      options: ["11:00", "12:00", "17:00", "18:00", "19:00"].map((t) => ({
        label: formatTimeLabel(t),
        value: t,
      })),
      allowCustom: true,
      customPlaceholder: "HH:MM (24-hour)",
      inputMode: "text",
    });
  }

  if (missing.includes("pickup_end_time")) {
    const start = draft.pickup_start_time ?? null;
    // Offsets from the answered start time. Every option is inside the
    // 12-hour ceiling `validatePickupWindow` enforces, so a tapped answer
    // can never produce an invalid window.
    const options: QuestionOption[] = start
      ? [60, 90, 120, 180].map((mins) => {
          const value = addMinutesToTime(start, mins);
          return {
            label: `${formatTimeLabel(value)} (${mins / 60}h)`,
            value,
          };
        })
      : [];
    questions.push({
      field: "pickup_end_time",
      prompt: "When does pickup end?",
      helper: start ? `Pickup starts at ${formatTimeLabel(start)}.` : undefined,
      options,
      allowCustom: true,
      customPlaceholder: "HH:MM (24-hour)",
      inputMode: "text",
    });
  }

  return questions;
}

/**
 * Coerce a raw answer string into the type the field expects.
 * Returns `undefined` when the answer is unusable — the caller re-asks
 * rather than guessing.
 */
export function coerceAnswer(
  field: RequiredDraftField,
  raw: string,
): string | number | undefined {
  const value = raw.trim();
  if (!value) return undefined;

  if (field === "price" || field === "total_spots") {
    const n = Number(value.replace(/^\$/, ""));
    if (!Number.isFinite(n)) return undefined;
    return field === "total_spots" ? Math.trunc(n) : n;
  }
  return value;
}
