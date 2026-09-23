import Link from "next/link";
import { categoryMeta } from "@/lib/categories";
import { discountPercent, formatMoney, timeLeftLabel } from "@/lib/money";
import type { ListingWithSeller } from "@/lib/market";

export function ListingCard({ listing }: { listing: ListingWithSeller }) {
  const meta = categoryMeta(listing.category);
  const off = discountPercent(listing.faceValueCents, listing.priceCents);

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group glass flex flex-col gap-3 rounded-2xl p-4 transition hover:border-lime-400/40 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-sm">
            {meta.emoji}
          </span>
          <span className="truncate">{meta.label}</span>
        </div>
        {off > 0 && (
          <span className="shrink-0 rounded-full bg-lime-400 px-2 py-0.5 text-xs font-bold text-ink-950">
            −{off}%
          </span>
        )}
      </div>

      <div>
        <h3 className="line-clamp-2 font-semibold leading-snug text-white group-hover:text-lime-300">
          {listing.title}
        </h3>
        <p className="mt-1 truncate text-sm text-slate-400">
          {listing.venue} · {listing.city}
        </p>
      </div>

      <div className="mt-auto flex items-end justify-between pt-2">
        <div>
          <div className="text-xl font-bold text-white">{formatMoney(listing.priceCents)}</div>
          <div className="text-xs text-slate-500 line-through">
            {formatMoney(listing.faceValueCents)}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="font-mono text-lime-300">{timeLeftLabel(listing.startsAt)}</div>
          <div className="text-slate-500">until it starts</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-slate-500">
        <span>{listing.partySize} {listing.partySize === 1 ? "guest" : "guests"}</span>
        {listing.isBoosted ? (
          <span className="text-amber-300">⚡ Boosted</span>
        ) : (
          <span>{listing.views} views</span>
        )}
      </div>
    </Link>
  );
}
