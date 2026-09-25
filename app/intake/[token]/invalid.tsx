import { DP } from "@/lib/theme/tokens";
import type { IntakeLinkFailure } from "@/lib/intake/session";

/**
 * The one page a visitor sees when a credential does not resolve.
 *
 * Shared by both intake routes. Expired, revoked, forged and
 * deactivated all render the SAME text on purpose — telling a visitor
 * which applies would confirm to someone probing codes that they had
 * found a real link. Only the two operator-facing configuration states
 * differ, and only because a partner seeing them should be told to
 * contact us rather than assume their link is simply old.
 */

const T = {
  bg: DP.dark.page,
  red: DP.brand[500],
  text: "#fff",
  muted: DP.zinc[400],
  display: "'DM Sans', sans-serif",
};

export default function IntakeLinkInvalid({ reason }: { reason: IntakeLinkFailure }) {
  const message =
    reason === "inactive"
      ? "This restaurant isn't active on DealsPro right now."
      : reason === "unconfigured"
        ? "Drop submission isn't switched on yet."
        : "This link has expired or is no longer valid.";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: T.bg,
        fontFamily: T.display,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 8 }}>
          {message}
        </h1>
        <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.5 }}>
          Ask your DealsPro contact for a fresh submission link.
        </p>
      </div>
    </main>
  );
}
