import Homepage from "@/components/Homepage";
import { getActiveDropsFromDb } from "@/lib/drops/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const drops = await getActiveDropsFromDb();
  return <Homepage initialDrops={drops} />;
}
