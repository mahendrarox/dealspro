import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/auth";

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin/login", request.url));
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
