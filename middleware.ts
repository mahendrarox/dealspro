import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Inline JWT verification to avoid importing `next/headers` in the edge runtime.
async function verifyAdminJwtEdge(token: string): Promise<boolean> {
  try {
    const secret = process.env.ADMIN_JWT_SECRET;
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!secret || !adminEmail) return false;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return (
      typeof payload.email === "string" &&
      payload.email.toLowerCase() === adminEmail.toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login flow and callback handler
  if (
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/auth/")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("dp_admin")?.value;
  if (!token) {
    const loginUrl = new URL("/admin/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const ok = await verifyAdminJwtEdge(token);
  if (!ok) {
    const loginUrl = new URL("/admin/login", req.url);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("dp_admin");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
