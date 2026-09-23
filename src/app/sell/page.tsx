import { redirect } from "next/navigation";
import { SellForm } from "@/components/sell-form";
import { getCurrentUser } from "@/lib/auth";
import { runMaintenance } from "@/lib/market";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function SellPage() {
  await ensureSeeded();
  await runMaintenance();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/sell");

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold">Sell a booking you can&apos;t use</h1>
        <p className="mt-2 text-slate-400">
          Standby takes 12% only when the transfer completes. Listing is free, and the escrow
          releases itself — you don&apos;t have to babysit the sale.
        </p>
      </div>
      <SellForm defaultCity={user.city || "San Francisco"} />
    </div>
  );
}
