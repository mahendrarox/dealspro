import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { getDropItem, formatTimeWindow, formatDate, getSavings } from "@/lib/constants";
import SuccessClient from "@/components/SuccessClient";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let order = null;
  let qrDataUrl = null;
  let dealCardUrl = null;
  let dropItemData = null;

  if (session_id) {
    const { data } = await supabase
      .from("orders")
      .select("drop_item_id, drop_title, restaurant_name, price_paid, qr_token")
      .eq("stripe_session_id", session_id)
      .single();

    if (data?.qr_token) {
      order = data;
      dealCardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ticket/${data.qr_token}`;
      qrDataUrl = await QRCode.toDataURL(dealCardUrl, {
        width: 200,
        margin: 2,
        color: { dark: "#18181B", light: "#FFFFFF" },
      });
      if (data.drop_item_id) {
        const item = getDropItem(data.drop_item_id);
        if (item) {
          dropItemData = {
            date: formatDate(item),
            timeWindow: formatTimeWindow(item),
            redemptionValidUntil: item.redemption_valid_until,
            savings: `$${getSavings(item).toFixed(2)}`,
            title: item.title,
            restaurantName: item.restaurant_name,
          };
        }
      }
    }
  }

  // Fallback savings if no drop item found
  const savings = dropItemData?.savings ?? "$9.99";
  const pickupWindow = dropItemData?.timeWindow ?? "TBD";

  return (
    <SuccessClient
      order={order}
      qrDataUrl={qrDataUrl}
      savings={savings}
      pickupWindow={pickupWindow}
      dealCardUrl={dealCardUrl}
      date={dropItemData?.date ?? null}
      redemptionValidUntil={dropItemData?.redemptionValidUntil ?? null}
    />
  );
}
