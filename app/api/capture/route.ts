import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, optIn, timestamp } = body;
    if (!name || !phone || !optIn) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    // TODO: Connect to Supabase
    console.log("[DealsPro Capture]", { name, phone, optIn, timestamp });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DealsPro Capture Error]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
