import type { ProviderResult } from "./provider";

/**
 * Deterministic stand-in for the LLM provider.
 *
 * Active only when `INTAKE_LLM_PROVIDER=mock`. Its entire purpose is to
 * let the regression suite drive the real intake pipeline — the same zod
 * validation, the same server action, the same DB writes — without ever
 * making a paid model call, and without the flakiness of asserting on a
 * real model's output.
 *
 * Two modes:
 *
 *   1. SCRIPTED. A message containing `[[MOCK <json>]]` returns that JSON
 *      verbatim as the "model output". This is how tests exercise the
 *      adversarial cases a real model might one day produce — extra keys,
 *      wrong types, a zero price, an invented original_price, a string
 *      where a number belongs — and prove the validator rejects them.
 *      The marker also supports `[[MOCK_FAIL]]` (provider error) and
 *      `[[MOCK_NO_TOOL]]` (model answered in prose).
 *
 *   2. HEURISTIC. Otherwise, a small deterministic regex pass that
 *      behaves like a well-mannered model: it reports what is plainly
 *      stated and returns null for everything else. It never invents an
 *      original_price, and it ignores anything that reads like an
 *      instruction — exactly the behaviour the system prompt asks of the
 *      real model.
 */

const SCRIPT_RE = /\[\[MOCK\s+([\s\S]*?)\]\]/;

export function mockStructuredExtraction(
  message: string,
  todayCentral: string,
): ProviderResult {
  if (message.includes("[[MOCK_FAIL]]")) {
    return { ok: false, reason: "provider_error" };
  }
  if (message.includes("[[MOCK_NO_TOOL]]")) {
    return { ok: false, reason: "no_tool_call" };
  }

  const scripted = SCRIPT_RE.exec(message);
  if (scripted) {
    try {
      return { ok: true, raw: JSON.parse(scripted[1]) };
    } catch {
      // A model that emits unparsable JSON is a provider error.
      return { ok: false, reason: "provider_error" };
    }
  }

  return { ok: true, raw: heuristicExtract(message, todayCentral) };
}

// ─── Heuristic pass ──────────────────────────────────────────────────

function heuristicExtract(message: string, todayCentral: string) {
  const text = message.toLowerCase();

  return {
    title: extractTitle(message),
    price: extractPrice(text),
    // Never invented. Only a literal "normally $X" / "usually $X" /
    // "regularly $X" counts.
    original_price: extractOriginalPrice(text),
    total_spots: extractSpots(text),
    pickup_date: extractDate(text, todayCentral),
    pickup_start_time: extractTime(text, "start"),
    pickup_end_time: extractTime(text, "end"),
  };
}

function extractTitle(message: string): string | null {
  // Strip anything that reads like an injected instruction before
  // considering it a title — mirrors system-prompt rule 6.
  const cleaned = message
    .replace(/\[\[.*?\]\]/g, " ")
    .replace(/ignore (all |any )?(previous |prior )?instructions?/gi, " ")
    .replace(/\b(system|assistant|publish|set price|make it live)\b/gi, " ");
  const m = /\b(?:doing|got|have|offering|selling)\s+([a-z0-9][a-z0-9 '&-]{2,60}?)\s*(?:,|\.|for|at|tonight|tomorrow|today|$)/i.exec(
    cleaned,
  );
  if (!m) return null;
  const title = m[1].trim().replace(/\s+/g, " ");
  if (title.length < 3) return null;
  return title
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function extractPrice(text: string): number | null {
  const m = /(?:for|at|each|price[d]?\s*(?:at)?)\s*\$?\s*(\d+(?:\.\d{1,2})?)/.exec(text);
  if (!m) {
    const bare = /\$\s*(\d+(?:\.\d{1,2})?)/.exec(text);
    return bare ? Number(bare[1]) : null;
  }
  return Number(m[1]);
}

function extractOriginalPrice(text: string): number | null {
  const m = /(?:normally|usually|regularly|regular price|was)\s*\$?\s*(\d+(?:\.\d{1,2})?)/.exec(
    text,
  );
  return m ? Number(m[1]) : null;
}

function extractSpots(text: string): number | null {
  const m = /(\d{1,4})\s*(?:spots?|portions?|boxes|plates?|orders?|servings?|available|left)/.exec(
    text,
  );
  return m ? Number(m[1]) : null;
}

function extractDate(text: string, todayCentral: string): string | null {
  const explicit = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (explicit) return explicit[0];
  if (/\btomorrow\b/.test(text)) return addDays(todayCentral, 1);
  if (/\b(tonight|today|this evening)\b/.test(text)) return todayCentral;
  return null;
}

/** Add whole days to a YYYY-MM-DD string without touching timezones. */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function extractTime(text: string, which: "start" | "end"): string | null {
  // "5-7pm", "5 to 7 pm", "17:00-19:00"
  const range =
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(
      text,
    );
  if (range) {
    const endMeridiem = range[6] ?? range[3] ?? null;
    const startMeridiem = range[3] ?? endMeridiem;
    return which === "start"
      ? to24h(Number(range[1]), range[2] ? Number(range[2]) : 0, startMeridiem)
      : to24h(Number(range[4]), range[5] ? Number(range[5]) : 0, endMeridiem);
  }
  if (which === "end") return null;

  const single = /(?:at|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(text);
  if (!single) return null;
  return to24h(Number(single[1]), single[2] ? Number(single[2]) : 0, single[3] ?? null);
}

function to24h(hour: number, minute: number, meridiem: string | null): string | null {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  let h = hour;
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
