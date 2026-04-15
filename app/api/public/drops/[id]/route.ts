import { NextRequest, NextResponse } from "next/server";
import { getDropByIdForServer } from "@/lib/drops/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await getDropByIdForServer(id);
  if (!item) {
    return NextResponse.json({ error: "This deal is no longer available" }, { status: 404 });
  }
  return NextResponse.json({ drop: item });
}
