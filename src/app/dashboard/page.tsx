import Link from "next/link";
import { redirect } from "next/navigation";
import { WalletActions } from "@/components/wallet-actions";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { getCurrentUser } from "@/lib/auth";
import { categoryMeta } from "@/lib/categories";
import {
  getUserListings,
  getUserPayouts,
  getUserTransactions,
  listingStatusMeta,
  runMaintenance,
} from "@/lib/market";
import { discountPercent, formatMoney, timeLeftLabel } from "@/lib/money";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await ensureSeeded();
  await runMaintenance();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const [selling, buying, txns, payoutRows] = await Promise.all([
    getUserListings(user.id, "selling"),
    getUserListings(user.id, "buying"),
    getUserTransactions(user.id),
    getUserPayouts(user.id),
  ]);

  return (
    <div className="space-y-10">
      {!user.emailVerifiedAt && <EmailVerificationBanner />}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="glass rounded-3xl p-6">
          <div className="text-xs uppercase tracking-widest text-slate-500">Standby wallet</div>
          <div className="mt-2 text-5xl font-black text-white">{formatMoney(user.balanceCents)}</div>
          <p className="mt-1 text-sm text-slate-400">
            Available to spend or withdraw. Simulated money — no real cards involved.
          </p>
          <div className="mt-6">
            <WalletActions balanceCents={user.balanceCents} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { k: "Recovered selling", v: formatMoney(user.lifetimeRecoveredCents), c: "text-lime-300" },
            { k: "Saved buying", v: formatMoney(user.lifetimeSavedCents), c: "text-sky-300" },
            { k: "Active listings", v: String(selling.filter((l) => l.status === "live").length), c: "text-white" },
            { k: "Bookings claimed", v: String(buying.length), c: "text-white" },
          ].map((s) => (
            <div key={s.k} className="glass flex flex-col justify-center rounded-2xl p-5">
              <div className={`text-2xl font-black ${s.c}`}>{s.v}</div>
              <div className="mt-1 text-xs text-slate-500">{s.k}</div>
            </div>
          ))}
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your listings</h2>
          <Link href="/sell" className="text-sm font-medium text-lime-300 hover:text-lime-200">
            + New listing
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {selling.length === 0 ? (
            <Empty text="You haven't listed anything yet. Turn a booking you can't use into cash." cta="/sell" />
          ) : (
            selling.map((l) => <ListingRow key={l.id} listing={l} role="selling" />)
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Bookings you claimed</h2>
        <div className="mt-4 space-y-3">
          {buying.length === 0 ? (
            <Empty text="Nothing claimed yet — browse live bookings near you." cta="/browse" />
          ) : (
            buying.map((l) => <ListingRow key={l.id} listing={l} role="buying" />)
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold">Activity</h2>
          <div className="mt-4 space-y-2">
            {txns.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              txns.map((t) => (
                <div
                  key={t.id}
                  className="glass flex items-center justify-between rounded-xl px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-white">{t.note}</div>
                    <div className="text-xs text-slate-500">
                      {t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
                      {t.kind}
                    </div>
                  </div>
                  <ActivityAmount
                    kind={t.kind}
                    grossCents={t.grossCents}
                    netCents={t.netCents}
                    buyerId={t.buyerId}
                    sellerId={t.sellerId}
                    userId={user.id}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold">Payouts</h2>
          <div className="mt-4 space-y-2">
            {payoutRows.length === 0 ? (
              <p className="text-sm text-slate-500">
                No payouts yet. Withdraw from your wallet to see them here.
              </p>
            ) : (
              payoutRows.map((p) => (
                <div key={p.id} className="glass flex items-center justify-between rounded-xl px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium text-white">{formatMoney(p.amountCents)} to your bank</div>
                    <div className="text-xs text-slate-500">
                      {p.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                    {p.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ActivityAmount({
  kind,
  grossCents,
  netCents,
  buyerId,
  sellerId,
  userId,
}: {
  kind: string;
  grossCents: number;
  netCents: number;
  buyerId: number | null;
  sellerId: number | null;
  userId: number;
}) {
  if (kind === "escrow_hold") {
    return (
      <div className={buyerId === userId ? "font-semibold text-amber-300" : "font-semibold text-slate-400"}>
        {buyerId === userId ? `−${formatMoney(grossCents)}` : `${formatMoney(grossCents)} held`}
      </div>
    );
  }
  if (kind === "refund") {
    return (
      <div className={buyerId === userId ? "font-semibold text-lime-300" : "font-semibold text-slate-400"}>
        {buyerId === userId ? `+${formatMoney(grossCents)}` : `${formatMoney(grossCents)} refunded`}
      </div>
    );
  }
  if (kind === "boost" || kind === "payout") {
    return <div className="font-semibold text-rose-300">−{formatMoney(grossCents)}</div>;
  }
  if (kind === "sale") {
    return (
      <div className={sellerId === userId ? "font-semibold text-lime-300" : "font-semibold text-slate-400"}>
        {sellerId === userId ? `+${formatMoney(netCents)}` : `${formatMoney(grossCents)} settled`}
      </div>
    );
  }
  return <div className="font-semibold text-lime-300">+{formatMoney(netCents || grossCents)}</div>;
}

function ListingRow({
  listing,
  role,
}: {
  listing: Awaited<ReturnType<typeof getUserListings>>[number];
  role: "selling" | "buying";
}) {
  const meta = categoryMeta(listing.category);
  const status = listingStatusMeta(listing.status);
  const off = discountPercent(listing.faceValueCents, listing.priceCents);
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="glass flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3 transition hover:border-lime-400/40"
    >
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5">{meta.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-white">{listing.title}</div>
        <div className="truncate text-xs text-slate-500">
          {listing.venue} · {listing.city} ·{" "}
          {listing.status === "live" ? `starts in ${timeLeftLabel(listing.startsAt)}` : listing.status}
        </div>
      </div>
      {off > 0 && <span className="text-xs text-lime-300">−{off}%</span>}
      <div className="text-right">
        <div className="font-bold text-white">{formatMoney(listing.priceCents)}</div>
        <div className="text-[11px] text-slate-500">{role === "selling" ? "asking" : "paid"}</div>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${status.cls}`}>
        {status.label}
      </span>
    </Link>
  );
}

function Empty({ text, cta }: { text: string; cta: string }) {
  return (
    <div className="glass rounded-2xl p-8 text-center">
      <p className="text-sm text-slate-400">{text}</p>
      <Link
        href={cta}
        className="mt-4 inline-block rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-ink-950 hover:bg-lime-300"
      >
        {cta === "/sell" ? "List a booking" : "Browse bookings"}
      </Link>
    </div>
  );
}
