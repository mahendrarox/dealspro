"use server";
import "server-only";
import { adminDb } from "@/lib/supabase-admin";

type LinkResult = { ok: true; link: string } | { ok: false; error: string };

/**
 * Generate a Supabase magic link using the service_role admin API.
 * The link is returned to the caller for on-screen display — no email
 * infrastructure is wired up yet. Clicking the link eventually lands on
 * /admin/auth/callback which exchanges the token and sets our own JWT
 * cookie (see lib/admin/auth.ts).
 */
export async function requestAdminLink(email: string): Promise<LinkResult> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return { ok: false, error: "Server is not configured (ADMIN_EMAIL missing)" };

  if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
    // Deliberately generic to avoid email enumeration
    return { ok: false, error: "Unauthorized" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // @ts-expect-error — auth.admin is present on service_role clients
  const { data, error } = await adminDb.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appUrl}/admin/auth/callback` },
  });

  if (error) {
    console.error("[admin-login] generateLink failed:", error);
    return { ok: false, error: "Could not generate sign-in link" };
  }

  const actionLink: string | undefined = data?.properties?.action_link;
  if (!actionLink) return { ok: false, error: "No action_link returned" };

  return { ok: true, link: actionLink };
}
