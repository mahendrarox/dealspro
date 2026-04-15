import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "dp_admin";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("[admin-auth] ADMIN_JWT_SECRET is missing or too short (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

function getAdminEmail(): string {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("[admin-auth] ADMIN_EMAIL is not set");
  return email.toLowerCase();
}

/** Sign a short-lived admin session JWT. */
export async function signAdminJwt(email: string): Promise<string> {
  return await new SignJWT({ email: email.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Verify an admin JWT. Returns null if invalid, expired, or wrong email. */
export async function verifyAdminJwt(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    if (!email || email !== getAdminEmail()) return null;
    return { email };
  } catch {
    return null;
  }
}

/**
 * Server Action / Server Component guard.
 * Throws "Unauthorized" if the current request does not have a valid admin session.
 */
export async function requireAdmin(): Promise<{ email: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) throw new Error("Unauthorized");
  const payload = await verifyAdminJwt(token);
  if (!payload) throw new Error("Unauthorized");
  return payload;
}

/** Non-throwing variant for layout/middleware use. */
export async function getAdminSession(): Promise<{ email: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return await verifyAdminJwt(token);
  } catch {
    return null;
  }
}

export { COOKIE_NAME as ADMIN_COOKIE_NAME, TTL_SECONDS as ADMIN_JWT_TTL };
