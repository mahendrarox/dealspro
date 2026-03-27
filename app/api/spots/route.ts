import { NextRequest, NextResponse } from "next/server";
import { getAllSpotsInfo, getSpotsInfo } from "@/lib/spots";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const info = await getSpotsInfo(id);
    return NextResponse.json({ spots: { [id]: info } });
  }

  const spots = await getAllSpotsInfo();
  return NextResponse.json({ spots });
}
