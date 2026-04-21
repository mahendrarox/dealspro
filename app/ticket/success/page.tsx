import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropByIdForServer } from "@/lib/drops/db";
import { isRedemptionValid } from "@/lib/drops/helpers";
import SuccessClient, { type SuccessInitialData } from "@/components/SuccessClient";
import type { TicketDrop, TicketStatus } from "@/components/TicketCard";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let initial: SuccessInitialData | null = null;

  if (session_id) {
    const { data, error: queryError } = await supabase
      .from("orders")
      .select("*")
      .eq("stripe_session_id", session_id)
      .maybeSingle();

    if (queryError) {
      console.log("[success] Supabase error:", queryError.message);
    }
    if (!data) {
      console.log("[success] No order found yet — will poll client-side");
    }

    if (data?.qr_token) {
      const dealCardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${data.qr_token}`;
      const qrDataUrl = await QRCode.toDataURL(dealCardUrl, {
        width: 240,
        margin: 2,
        color: { dark: "#18181B", light: "#FFFFFF" },
      });

      const item = data.drop_item_id ? await getDropByIdForServer(data.drop_item_id) : null;
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

      const isRedeemed = data.redemption_status === "redeemed";
      const isExpired = item ? !isRedemptionValid(item) : false;
      const status: TicketStatus = isRedeemed ? "redeemed" : isExpired ? "expired" : "active";

      initial = {
        orderId: data.id ?? data.qr_token,
        qrToken: data.qr_token,
        phone: data.phone ?? null,
        quantity: data.quantity ?? 1,
        pricePaid: Number(data.price_paid),
        status,
        redeemedAt: data.redeemed_at ?? null,
        qrDataUrl,
        drop,
      };
    }
  }

  return <SuccessClient initial={initial} />;
}
