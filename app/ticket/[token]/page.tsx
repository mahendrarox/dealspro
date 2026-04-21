import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropByIdForServer } from "@/lib/drops/db";
import { isRedemptionValid } from "@/lib/drops/helpers";
import TicketCard, { type TicketDrop, type TicketStatus } from "@/components/TicketCard";

export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("qr_token", token)
    .single();

  if (error || !order) {
    notFound();
  }

  const item = order.drop_item_id ? await getDropByIdForServer(order.drop_item_id) : null;
  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${token}`;
  const qrDataUrl = await QRCode.toDataURL(ticketUrl, {
    width: 240,
    margin: 2,
    color: { dark: "#18181B", light: "#FFFFFF" },
  });

  const isRedeemed = order.redemption_status === "redeemed";
  const isExpired = item ? !isRedemptionValid(item) : false;

  const status: TicketStatus = isRedeemed ? "redeemed" : isExpired ? "expired" : "active";

  const drop: TicketDrop | null = item
    ? {
        title: item.title,
        restaurantName: item.restaurant_name,
        price: item.price,
        originalPrice:
          item.original_price && item.original_price > 0 ? item.original_price : null,
        date: item.date,
        startTime: item.start_time,
        endTime: item.end_time,
        address: item.address || null,
        lat: item.lat || null,
        lng: item.lng || null,
      }
    : null;

  return (
    <TicketCard
      orderId={order.id ?? order.qr_token}
      qrToken={order.qr_token}
      phone={order.phone ?? null}
      quantity={order.quantity ?? 1}
      pricePaid={Number(order.price_paid)}
      status={status}
      redeemedAt={order.redeemed_at ?? null}
      qrDataUrl={qrDataUrl}
      drop={drop}
    />
  );
}
