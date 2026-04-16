import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealsPro — Exclusive Restaurant Deals, Limited Drops",
  description: "Half-price restaurant deals, limited to 20 per week. No app needed — deals delivered straight to your phone via text.",
};

/**
 * Supabase magic-link hash handler.
 *
 * Runs as an inline <script> before React hydrates — zero import chain,
 * zero compilation boundary, zero SSR impact. Detects #access_token= in
 * the URL hash on ANY page, exchanges it for a dp_admin session cookie
 * via /admin/auth/verify, clears the hash, and redirects to /admin/drops.
 *
 * This is deliberately vanilla JS (not a React component) because adding
 * a client component to the root layout triggers Turbopack to recompile
 * every page in the app, causing compilation hangs in worktree contexts.
 */
const AUTH_HASH_SCRIPT = `
(function() {
  var h = location.hash;
  if (!h || h.indexOf('access_token=') === -1) return;
  var p = new URLSearchParams(h.substring(1));
  var t = p.get('access_token');
  if (!t) return;
  history.replaceState(null, '', location.pathname + location.search);
  fetch('/admin/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: t })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    location.href = d.ok ? '/admin/drops' : '/admin/login?error=verify_failed';
  })
  .catch(function() {
    location.href = '/admin/login?error=network';
  });
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: AUTH_HASH_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
