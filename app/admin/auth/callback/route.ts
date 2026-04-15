import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase-admin";
import { signAdminJwt, ADMIN_COOKIE_NAME, ADMIN_JWT_TTL } from "@/lib/admin/auth";

/**
 * Supabase redirects the user here after they click the magic link.
 * Query params come in one of two forms:
 *
 *   1. ?token_hash=xxx&type=magiclink  (Supabase "verify" flow)
 *   2. #access_token=...&refresh_token=... (hash fragment from Supabase verify)
 *
 * We only support form (1) because it is server-readable. Supabase's
 * generateLink() uses /verify with token_hash as query, which matches.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || type !== "magiclink") {
    return NextResponse.redirect(new URL("/admin/login?error=invalid_link", request.url));
  }

  // @ts-expect-error — verifyOtp is on supabase-js auth client
  const { data, error } = await adminDb.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });

  if (error || !data?.user?.email) {
    console.error("[admin-auth] verifyOtp failed:", error);
    return NextResponse.redirect(new URL("/admin/login?error=verify_failed", request.url));
  }

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail || data.user.email.toLowerCase() !== adminEmail) {
    return NextResponse.redirect(new URL("/admin/login?error=forbidden", request.url));
  }

  const jwt = await signAdminJwt(data.user.email);
  const res = NextResponse.redirect(new URL("/admin/drops", request.url));
  res.cookies.set(ADMIN_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_JWT_TTL,
  });
  return res;
}
