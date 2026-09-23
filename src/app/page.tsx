import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { browseListings, getPlatformStats, runMaintenance } from "@/lib/market";
import { ensureSeeded } from "@/lib/seed";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    n: "01",
    title: "List the booking you can't use",
    body: "Paste the venue, time and what you paid. Standby prices it against comparable last-minute demand and publishes it in seconds.",
  },
  {
    n: "02",
    title: "Buyers claim it, money sits in escrow",
    body: "A buyer pays the discounted price into Standby escrow. You keep ownership until the handoff is confirmed.",
  },
  {
    n: "03",
    title: "Escrow releases itself",
    body: "Three hours after the booking window closes, eligible funds release to the seller automatically, while exceptions stay visible for review.",
  },
];

export default async function HomePage() {
  await ensureSeeded();
  await runMaintenance();
  const [featured, stats] = await Promise.all([browseListings({ sort: "soonest" }), getPlatformStats()]);
  const top = featured.slice(0, 6);

  return (
    <div className="space-y-20">
      {/* HERO */}
      <section className="grid gap-10 pt-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-xs font-medium text-lime-300">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
            The resale market for bookings that never had one
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Your non-refundable booking is
            <span className="text-lime-400"> worth something.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-400">
            Every year, hundreds of billions in prepaid hotels, tastings, tee times, classes and shows
            go unused because plans changed. Standby turns that dead capital into a live marketplace —
            sellers recover cash, buyers save up to 60%, and the platform earns a fee on every
            transfer without lifting a finger.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/browse"
              className="rounded-full bg-lime-400 px-6 py-3 font-semibold text-ink-950 transition hover:bg-lime-300"
            >
              Browse live bookings
            </Link>
            <Link
              href="/sell"
              className="rounded-full border border-white/20 px-6 py-3 font-semibold text-white transition hover:border-white/50"
            >
              Sell a booking
            </Link>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {[
              { k: formatMoney(stats.gmvCents), v: "GMV transferred" },
              { k: `${stats.avgDiscountPct}%`, v: "Avg. buyer saving" },
              { k: formatMoney(stats.revenueCents), v: "Platform revenue earned" },
            ].map((s) => (
              <div key={s.v}>
                <dt className="text-2xl font-bold text-white">{s.k}</dt>
                <dd className="text-xs text-slate-500">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Revenue engine
            </h2>
            <span className="flex items-center gap-1 text-xs text-lime-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-400" /> live
            </span>
          </div>
          <p className="mt-4 text-4xl font-black text-white">{formatMoney(stats.revenueCents)}</p>
          <p className="text-sm text-slate-400">collected in fees so far</p>

          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-500">Last 7 days</div>
              <div className="font-semibold text-white">{formatMoney(stats.revenue7dCents)}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xs text-slate-500">Run rate / year</div>
              <div className="font-semibold text-lime-300">{formatMoney(stats.annualRunRateCents)}</div>
            </div>
          </div>

          <div className="mt-5 flex h-24 items-end gap-1.5">
            {stats.byCategory.slice(0, 8).map((c, i) => {
              const max = Math.max(...stats.byCategory.map((x) => x.revenueCents), 1);
              return (
                <div key={c.category} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="pulse-bar w-full rounded-t bg-lime-400/70"
                    style={{
                      height: `${Math.max(8, (c.revenueCents / max) * 80)}px`,
                      animationDelay: `${i * 0.12}s`,
                    }}
                  />
                  <span className="text-[9px] text-slate-500">{c.category.slice(0, 4)}</span>
                </div>
              );
            })}
          </div>

          <Link
            href="/revenue"
            className="mt-5 block rounded-xl border border-white/10 py-2.5 text-center text-sm font-medium text-slate-300 transition hover:border-lime-400/40 hover:text-white"
          >
            Open the full revenue dashboard →
          </Link>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section>
        <h2 className="text-2xl font-bold">How a transfer works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="glass rounded-2xl p-5">
              <div className="font-mono text-xs text-lime-400">{s.n}</div>
              <h3 className="mt-3 font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY NOW */}
      <section className="grid gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold">Why nobody has built this</h2>
          <p className="mt-3 text-slate-400">
            Ticket resale exists for stadium shows. Hotel resale doesn&apos;t — because the hard part
            isn&apos;t the listing, it&apos;s the <em>handoff</em>. Standby solves it with a
            transfer-code protocol and time-based escrow designed to automate the routine path while keeping exceptions explicit:
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li>• Escrow auto-releases 3 hours after the booking window when no exception is raised.</li>
            <li>• Listings auto-expire the moment the reservation starts — no stale inventory.</li>
            <li>• Ledger events separate escrow, sales, boosts, refunds and payouts for auditable reconciliation.</li>
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3 self-center">
          {[
            { k: "12%", v: "Platform fee per transfer" },
            { k: "$1.99", v: "Optional 24h priority boost" },
            { k: "Auto", v: "Routine settlement path" },
            { k: `${stats.liveListings}`, v: "Live bookings right now" },
          ].map((s) => (
            <div key={s.v} className="rounded-2xl border border-white/10 bg-ink-900 p-4">
              <div className="text-2xl font-black text-lime-400">{s.k}</div>
              <div className="mt-1 text-xs text-slate-400">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold">Live on Standby</h2>
            <p className="mt-1 text-sm text-slate-400">Grab it before the clock runs out.</p>
          </div>
          <Link href="/browse" className="text-sm font-medium text-lime-300 hover:text-lime-200">
            See all →
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      </section>
    </div>
  );
}
