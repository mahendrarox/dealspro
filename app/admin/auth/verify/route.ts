import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/supabase-admin";
import { signAdminJwt, ADMIN_COOKIE_NAME, ADMIN_JWT_TTL } from "@/lib/admin/auth";

/**
 * POST /admin/auth/verify
 *
 * Receives a Supabase access_token (from the magic-link hash fragment),
 * verifies it against the Supabase Auth API using the service_role client,
 * confirms the user's email matches ADMIN_EMAIL, and sets our dp_admin
 * JWT cookie for subsequent admin route access.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken: string | undefined = body?.access_token;

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access_token" }, { status: 400 });
    }

    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    if (!adminEmail) {
      console.error("[admin-auth-verify] ADMIN_EMAIL env var not set");
      return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
    }

    // Verify the Supabase-issued access_token via the Auth API
    const db = getAdminDb();
    const { data, error } = await db.auth.getUser(accessToken);

    if (error || !data?.user?.email) {
      console.error("[admin-auth-verify] getUser failed:", error?.message);
      return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
    }

    const userEmail = data.user.email.toLowerCase();
    if (userEmail !== adminEmail) {
      console.warn("[admin-auth-verify] email mismatch:", userEmail, "!==", adminEmail);
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    // Sign our own admin JWT and set it as an HTTP-only cookie
    const jwt = await signAdminJwt(userEmail);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE_NAME, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_JWT_TTL,
    });
    return res;
  } catch (err) {
    console.error("[admin-auth-verify] unhandled:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
