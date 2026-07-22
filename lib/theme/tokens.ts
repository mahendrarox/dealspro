/**
 * DealsPro color tokens — single source of truth for CUSTOMER-FACING colors.
 *
 * This file centralizes the palette that was previously duplicated across
 * ~8 component/route files (the brand red `#F93A25` alone appeared in 7
 * files). Every value here is the EXACT current production value — importing
 * these tokens is a pure refactor with ZERO intended visual change.
 *
 * ── Semantic separation (important) ──────────────────────────────────────
 * `brand.*` (CTA / urgency / highlight) and `danger.*` (error / destructive)
 * are DELIBERATELY separate token groups even though `danger.fg` currently
 * equals `brand[500]` (#F93A25). This lets a future accessibility PR shift
 * error red without touching brand red.
 *
 * ── Documented follow-up work (NOT done here) ────────────────────────────
 *  • A11y: several small-text brand/amber/green-on-white pairs sit ~3.2–3.7:1
 *    (< WCAG AA 4.5). Do NOT "fix" by editing these values in this refactor.
 *  • `slate.*` (#1F2937 / #374151) are off-palette blue-lean grays kept
 *    byte-identical here; a later PR may swap them to true neutrals.
 *  • Dark mode: none exists today. If added, every group needs dark values.
 *
 * Scope: customer-facing surfaces only. Studio/admin styling is out of scope.
 */

export const DP = {
  /** Warm DealsPro fire ramp — CTA, urgency, badges, highlights. */
  brand: {
    50: "#FFF1EC",
    100: "#FFE0D4",
    orange400: "#FB8C3C",
    500: "#F93A25", // primary brand red — CTA rest, "Only N left", DROP tag text base
    600: "#E0311F", // CTA hover
    700: "#C72A1A", // tag / chip text on light
    /** Legacy soft-red alias retained from the pre-fire palette (rarely used). */
    softRed100: "#F9A29A",
  },

  /**
   * Brand red as rgba — single source for the ~22 alpha variants of
   * `rgba(249,58,37,α)` scattered across the app (glows, tints, borders).
   */
  brandAlpha: (a: number): string => `rgba(249, 58, 37, ${a})`,

  /** Byte-exact gradient strings (preserve verbatim). */
  gradient: {
    hero: "linear-gradient(120deg, #FB8C3C 0%, #F93A25 100%)", // Homepage "Gone fast." + fireGrad
    card1: "linear-gradient(135deg, #F93A25, #FB8C3C)", // SampleDropCard 1 + HeroMockup thumb
    card2: "linear-gradient(135deg, #C72A1A, #F97316)", // SampleDropCard 2
    card3: "linear-gradient(135deg, #E0311F, #FBBF24)", // SampleDropCard 3
    barNormal: "linear-gradient(90deg, #FB8C3C, #F93A25)",
    barMedium: "linear-gradient(90deg, #FF9500, #FFB347)",
    barCriticalLast: "linear-gradient(90deg, #F93A25, #FF6B5A)",
    barSoldOut: "linear-gradient(90deg, #666, #888)",
    dropDetailBar: "linear-gradient(90deg, #F93A25 0%, #D97706 100%)", // /drop scarcity bar
    ticketFront: "linear-gradient(145deg, #F93A25 0%, #E8301A 50%, #D42A16 100%)", // TicketCard face
    shimmer: "linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)", // SuccessClient skeleton
    /** Off-palette slate fallback behind a missing real-DropCard image. */
    imageFallbackSlate: "linear-gradient(135deg, #1f2937, #374151)",
    /** Neutral near-black fallback behind a missing /drop hero image. */
    imageFallbackNeutral: "linear-gradient(135deg, #1c1c1e, #2b2b2f)",
  },

  /** Warm one-off accents used in scarcity/mockup treatments. */
  accent: {
    orange500: "#F97316",
    gold: "#FBBF24",
    pulseMedium: "#FFB347", // real DropCard "going fast" pulse dot
    pulseCritical: "#FF4D3A", // real DropCard "critical/last" pulse dot
    scarcityOnDark: "#FF8A5C", // HeroMockup "Only N left"
    tagOnDark: "#FDBA8C", // HeroMockup category tag
    heroBadgeText: "#FFD9CC", // hero locality badge + trust line text on dark
  },

  /** Primary near-black used for ink text and (historically) CTA fills. */
  ink: "#161616",

  /**
   * Cool "zinc" neutral ramp (Homepage / DropsSection / scan). Numeric keys
   * follow the true Tailwind zinc scale so values are unambiguous, e.g.
   * Homepage's local `n500` (#52525B) maps to `zinc[600]`.
   */
  zinc: {
    0: "#FFFFFF",
    50: "#F7F7F8",
    200: "#E4E4E7",
    300: "#D4D4D8",
    400: "#A1A1AA",
    500: "#71717A", // scan muted text
    600: "#52525B", // Homepage/DropsSection `n500`
    800: "#1C1C21",
    900: "#18181B",
    950: "#111114",
  },

  /** Cool "gray" neutral ramp (/drop detail, TicketCard, SuccessClient). */
  gray: {
    50: "#F3F4F6",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    900: "#111827",
  },

  /** Fixed dark surfaces (intrinsic, not a dark *mode*). */
  dark: {
    page: "#0A0A0A", // /drop page, /r bg + input
    rPanel: "#14141A", // /r capture panel
    rBorder: "#27272A", // /r borders
    rText: "#F4F4F5", // /r text
    scanPage: "#111114", // /scan page
    scanPanel: "#0A0A0D", // /scan inner panel
    confirmModal: "#1A1A1A", // TicketCard/drop confirm modal
  },

  /** Off-palette blue-lean slate (kept byte-identical; flagged for later swap). */
  slate: {
    700: "#374151",
    800: "#1F2937",
  },

  /** Disabled + sold-out / ended states. */
  disabled: {
    bg: "#E5E7EB", // submit disabled bg
    bgZinc: "#E4E4E7", // Btn disabled bg (== zinc 200)
    fg: "#A1A1AA", // disabled fg (== zinc 400)
    fgText: "rgb(75, 85, 99)", // submit disabled label
    controlBg: "#3F3F46", // /r capture disabled button + checkbox border
    soldBg: "#555", // sold-out button bg
    soldFg: "rgba(255,255,255,0.5)", // sold-out button label
  },

  /** Warning / caution (amber). */
  warning: {
    fg: "#D97706", // amber500 — "going fast" urgency text
    bg: "#FEF3C7", // amber50
    field: "#F59E0B", // form field validation amber (Homepage AMBER)
    soft: "#FDE68A", // light amber accent (TicketCard)
  },

  /** Success / confirmation (green). */
  success: {
    fg: "#16A34A", // green500
    fgDeep: "#059669", // greenFg
    bg: "#DCFCE7", // green50 / greenBg
    bgAlt: "#ECFDF5", // ticket/drop success bg
    check: "#22C55E", // valid checkmark / consent
    light: "#86EFAC", // light green accent (TicketCard/scan)
  },

  /** Form validation states. */
  validation: {
    valid: "#22C55E", // == success.check
    invalid: "#F59E0B", // == warning.field
    neutralBorder: "#D1D5DB", // resting input border (== gray 300)
  },

  /**
   * Danger / error / destructive. SEMANTICALLY separate from `brand` even
   * though `fg` currently equals `brand[500]`. Change these — not brand —
   * in a future a11y PR.
   */
  danger: {
    fg: "#F93A25", // error text (== brand[500] today)
    bgSoft: "rgba(249,58,37,0.1)", // error box bg
    border: "rgba(249,58,37,0.25)", // error box border
    strong: "#EF4444", // ticket/scan "redeemed"/error red
    strongBg: "#FEE2E2", // light error bg (TicketCard/scan)
    strongText: "#FECACA", // error text on dark (scan)
  },

  /** Reused brand shadow (glow) strings. */
  shadow: {
    brandGlow: "0 4px 14px rgba(249, 58, 37, 0.35)", // /drop + TicketCard redShadow
  },
} as const;

export type DPTokens = typeof DP;
