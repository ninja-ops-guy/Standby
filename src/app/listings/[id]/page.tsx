import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingActions } from "@/components/listing-actions";
import { getCurrentUser } from "@/lib/auth";
import { categoryMeta } from "@/lib/categories";
import { getListing, incrementViews, listingStatusMeta, runMaintenance } from "@/lib/market";
import { discountPercent, formatMoney, platformFeeCents, sellerNetCents, timeLeftLabel } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  await runMaintenance();
  const user = await getCurrentUser();
  const listing = await getListing(numericId);
  if (!listing) notFound();

  const isOwner = user?.id === listing.sellerId;
  const isBuyer = user?.id === listing.buyerId;
  const canSeeCode = Boolean(user && (isOwner || isBuyer)) && listing.status !== "live";
  const status = listingStatusMeta(listing.status);
  const meta = categoryMeta(listing.category);
  const off = discountPercent(listing.faceValueCents, listing.priceCents);

  if (!isOwner) await incrementViews(listing.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Link href="/browse" className="text-sm text-slate-500 hover:text-slate-300">
          ← Back to browse
        </Link>

        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-slate-300">
              {meta.emoji} {meta.label}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-medium ring-1 ${status.cls}`}>
              {status.label}
            </span>
            {off > 0 && (
              <span className="rounded-full bg-lime-400 px-2.5 py-1 font-bold text-ink-950">
                {off}% below face value
              </span>
            )}
          </div>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{listing.title}</h1>
          <p className="mt-2 text-slate-400">
            {listing.venue} · {listing.city}
          </p>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            What you&apos;re getting
          </h2>
          <p className="mt-3 leading-relaxed text-slate-300">
            {listing.description || "No extra details provided by the seller."}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {[
              { k: "Starts in", v: timeLeftLabel(listing.startsAt) },
              { k: "Guests", v: String(listing.partySize) },
              { k: "Listed", v: `${Math.max(1, Math.round((Date.now() - listing.createdAt.getTime()) / 3600000))}h ago` },
              { k: "Views", v: String(listing.views) },
            ].map((d) => (
              <div key={d.k}>
                <dt className="text-xs text-slate-500">{d.k}</dt>
                <dd className="font-semibold text-white">{d.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs text-slate-500">
            Starts {listing.startsAt.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
          </p>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            How the handoff works
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-slate-300">
            <li>1. Claim the booking — your payment is held in escrow, not paid out yet.</li>
            <li>2. The seller shares the transfer code below with you so you can reassign the booking.</li>
            <li>3. Three hours after the booking starts, escrow releases to the seller automatically.</li>
          </ol>
          {canSeeCode ? (
            <div className="mt-5 rounded-xl border border-lime-400/30 bg-lime-400/10 p-4 text-center">
              <div className="text-xs uppercase tracking-widest text-lime-300">Transfer code</div>
              <div className="mt-1 font-mono text-2xl font-black tracking-widest text-white">
                {listing.transferCode}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-slate-500">
              The transfer code unlocks for the buyer and seller once the booking is claimed.
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="glass rounded-3xl p-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-4xl font-black text-white">{formatMoney(listing.priceCents)}</div>
              <div className="text-sm text-slate-500 line-through">
                paid {formatMoney(listing.faceValueCents)}
              </div>
            </div>
            <div className="text-right text-sm text-lime-300">
              save {formatMoney(listing.faceValueCents - listing.priceCents)}
            </div>
          </div>

          <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Purchase price</span>
              <span>{formatMoney(listing.priceCents)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Platform fee (12%)</span>
              <span>{formatMoney(platformFeeCents(listing.priceCents))}</span>
            </div>
            <div className="flex justify-between font-semibold text-white">
              <span>Seller receives</span>
              <span>{formatMoney(sellerNetCents(listing.priceCents))}</span>
            </div>
          </div>

          <div className="mt-5">
            {user ? (
              <ListingActions
                listingId={listing.id}
                status={listing.status}
                isOwner={Boolean(isOwner)}
                isBuyer={Boolean(isBuyer)}
                priceCents={listing.priceCents}
                walletCents={user.balanceCents}
              />
            ) : (
              <Link
                href="/login"
                className="block w-full rounded-2xl bg-lime-400 py-3.5 text-center text-base font-bold text-ink-950 transition hover:bg-lime-300"
              >
                Log in to claim
              </Link>
            )}
          </div>
        </div>

        <div className="glass rounded-2xl p-5 text-sm">
          <div className="text-xs uppercase tracking-widest text-slate-500">Listed by</div>
          <div className="mt-2 font-semibold text-white">{listing.sellerName}</div>
          <div className="text-slate-400">{listing.city}</div>
        </div>
      </aside>
    </div>
  );
}
