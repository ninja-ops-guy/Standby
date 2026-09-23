import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { CATEGORIES } from "@/lib/categories";
import { browseListings, runMaintenance } from "@/lib/market";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function one(sp: SP, key: string): string {
  const v = sp[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await ensureSeeded();
  await runMaintenance();
  const sp = await searchParams;
  const q = one(sp, "q");
  const category = one(sp, "category");
  const city = one(sp, "city");
  const maxPrice = Number(one(sp, "maxPrice")) || 0;
  const sort = one(sp, "sort") || "soonest";

  const listings = await browseListings({
    q: q || undefined,
    category: category || undefined,
    city: city || undefined,
    maxPrice: maxPrice > 0 ? Math.round(maxPrice * 100) : undefined,
    sort,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Live bookings</h1>
        <p className="mt-1 text-slate-400">
          {listings.length} reservation{listings.length === 1 ? "" : "s"} available right now.
        </p>
      </div>

      <form className="glass grid gap-3 rounded-2xl p-4 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search venue, title or city…"
          className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50"
        />
        <select
          name="category"
          defaultValue={category}
          className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-lime-400/50"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <input
          name="city"
          defaultValue={city}
          placeholder="City"
          className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50"
        />
        <input
          name="maxPrice"
          type="number"
          min="0"
          step="10"
          defaultValue={maxPrice || ""}
          placeholder="Max $"
          className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50"
        />
        <select
          name="sort"
          defaultValue={sort}
          className="rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-lime-400/50"
        >
          <option value="soonest">Starting soonest</option>
          <option value="price">Lowest price</option>
          <option value="discount">Biggest discount</option>
        </select>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-lime-300"
          >
            Apply
          </button>
          <Link
            href="/browse"
            className="rounded-xl border border-white/15 px-3 py-2 text-sm text-slate-300 transition hover:border-white/40"
          >
            Reset
          </Link>
        </div>
      </form>

      {listings.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-lg font-semibold">Nothing matches yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Try widening your filters — or be the first to list in this category.
          </p>
          <Link
            href="/sell"
            className="mt-5 inline-block rounded-full bg-lime-400 px-5 py-2.5 font-semibold text-ink-950 hover:bg-lime-300"
          >
            List a booking
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}
