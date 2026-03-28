import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getDropItem, isRedemptionValid } from "@/lib/constants";

// ── Structured logging ──────────────────────────────────────────────
function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event: "redeem", action: event, timestamp: new Date().toISOString(), ...data }));
}

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    log("missing_token", {});
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  log("redeem_requested", { qr_token: token });

  // Check redemption window before attempting atomic update
  const { data: orderCheck } = await supabase
    .from("orders")
    .select("drop_item_id")
    .eq("qr_token", token)
    .single();

  if (!orderCheck) {
    log("not_found", { qr_token: token });
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const dropItem = orderCheck.drop_item_id ? getDropItem(orderCheck.drop_item_id) : null;
  if (dropItem && !isRedemptionValid(dropItem)) {
    log("expired", { qr_token: token, drop_item_id: orderCheck.drop_item_id });
    return NextResponse.json({ error: "This deal card has expired" }, { status: 400 });
  }

  // Atomic redemption — only one request can change pending → redeemed
  const { data: rpcResult, error: rpcError } = await supabase.rpc("redeem_order_atomic", {
    p_qr_token: token,
  });

  if (rpcError) {
    log("rpc_error", { qr_token: token, error: rpcError.message });
    return NextResponse.json({ error: "Redemption failed" }, { status: 500 });
  }

  const status = rpcResult?.status;

  if (status === "not_found") {
    log("not_found", { qr_token: token });
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (status === "already_redeemed") {
    log("already_redeemed", { qr_token: token, drop_item_id: orderCheck.drop_item_id });
    return NextResponse.json({
      error: "Already redeemed",
      order: rpcResult.order,
      dropItem,
    }, { status: 409 });
  }

  // status === "redeemed"
  log("redeemed", { qr_token: token, drop_item_id: orderCheck.drop_item_id, order_id: rpcResult.order?.id });
  return NextResponse.json({
    success: true,
    order: rpcResult.order,
    dropItem,
  });
}
