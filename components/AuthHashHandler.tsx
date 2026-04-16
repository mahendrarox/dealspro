"use client";

import { useEffect } from "react";

/**
 * Global client component that detects Supabase magic-link hash tokens
 * in the URL and exchanges them for an admin session cookie.
 *
 * When Supabase completes a magic-link auth flow, it redirects to the
 * app with tokens in the URL hash fragment:
 *   https://dealspro.ai/#access_token=xxx&refresh_token=yyy&type=magiclink
 *
 * This component:
 * 1. Parses the hash on page load
 * 2. POSTs the access_token to /admin/auth/verify (server-side verification)
 * 3. Server verifies the token with Supabase, checks ADMIN_EMAIL match,
 *    and sets the dp_admin JWT cookie
 * 4. Client redirects to /admin/drops
 *
 * Mounted once in the root layout so it catches the hash regardless of
 * which page Supabase redirects to.
 */
export default function AuthHashHandler() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token=")) return;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken) return;

    // Clear the hash immediately so tokens aren't visible in the URL bar
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    // Exchange the Supabase token for our dp_admin session cookie
    fetch("/admin/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          window.location.href = "/admin/drops";
        } else {
          console.error("[AuthHashHandler] verify failed:", data.error);
          window.location.href = "/admin/login?error=verify_failed";
        }
      })
      .catch((err) => {
        console.error("[AuthHashHandler] verify error:", err);
      });
  }, []);

  return null;
}
