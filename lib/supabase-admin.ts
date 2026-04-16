import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 *
 * This client bypasses RLS by design. It MUST NEVER be imported into a
 * client component or any file that is bundled for the browser. The
 * `'server-only'` marker at the top of this file causes the Next.js
 * bundler to throw if that happens.
 *
 * All admin mutations flow through this client after a manual JWT
 * verification in the Server Action (see lib/admin/auth.ts).
 */
let _client: SupabaseClient | null = null;

export function getAdminDb(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[supabase-admin] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing",
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/** Convenience: the same client, pre-resolved for ergonomic imports. */
export const adminDb = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getAdminDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
