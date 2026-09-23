import Link from "next/link";
import { categoryMeta } from "@/lib/categories";
import { getDailyRevenue, getPlatformStats, runMaintenance } from "@/lib/market";
import { formatMoney } from "@/lib/money";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  await ensureSeeded();
  await runMaintenance();
  const [stats, series] = await Promise.all([getPlatformStats(), getDailyRevenue(30)]);

  const max = Math.max(...series.map((s) => s.revenueCents), 1);
  const transfersPerDay = series.length ? series.reduce((a, s) => a + s.transfers, 0) / series.length : 0;
  const feePerTransfer = stats.avgFeeCents;
  const dailyRunRate = Math.round(stats.revenue7dCents / 7);

  const scale = [
    { label: "Today", transfers: Math.round(transfersPerDay), revenue: dailyRunRate },
    { label: "1k transfers / mo", transfers: 1000, revenue: Math.round(feePerTransfer * 1000) },
    { label: "25k transfers / mo", transfers: 25000, revenue: Math.round(feePerTransfer * 25000) },
    { label: "250k transfers / mo", transfers: 250000, revenue: Math.round(feePerTransfer * 250000) },
  ];

  return (
    <div className="space-y-10">
      <div>
        <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-xs font-medium text-lime-300">
          Passive revenue engine
        </span>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          {formatMoney(stats.revenueCents)} earned, {stats.completedTransfers} transfers settled.
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Routine transfers are designed to settle automatically: escrow captures the payment, the booking
          window closes, eligible funds release, and the platform records its 12% fee. Exceptions and ledger
          states remain explicit so the automated path stays auditable.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "Total fees earned", v: formatMoney(stats.revenueCents), s: "all time", c: "text-lime-300" },
          { k: "Monthly run rate", v: formatMoney(stats.monthlyRunRateCents), s: "from last 7 days", c: "text-white" },
          { k: "Annualised run rate", v: formatMoney(stats.annualRunRateCents), s: "if volume holds", c: "text-white" },
          { k: "Gross merchandise value", v: formatMoney(stats.gmvCents), s: "transferred", c: "text-white" },
        ].map((s) => (
          <div key={s.k} className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-widest text-slate-500">{s.k}</div>
            <div className={`mt-2 text-3xl font-black ${s.c}`}>{s.v}</div>
            <div className="text-xs text-slate-500">{s.s}</div>
          </div>
        ))}
      </section>

      <section className="glass rounded-3xl p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Fees collected per day · last 30 days</h2>
            <p className="text-sm text-slate-500">
              Average {transfersPerDay.toFixed(1)} transfers/day · {formatMoney(feePerTransfer)} per
              transfer
            </p>
          </div>
          <div className="flex gap-4 text-xs text-slate-400">
            <span>Today {formatMoney(stats.revenueTodayCents)}</span>
            <span>7d {formatMoney(stats.revenue7dCents)}</span>
            <span>30d {formatMoney(stats.revenue30dCents)}</span>
          </div>
        </div>

        <div className="mt-6 flex h-48 items-end gap-1.5">
          {series.map((s, i) => (
            <div key={s.day} className="group relative flex-1">
              <div
                className="w-full rounded-t bg-gradient-to-t from-lime-500/40 to-lime-300 transition group-hover:from-lime-400 group-hover:to-lime-200"
                style={{ height: `${Math.max(3, (s.revenueCents / max) * 180)}px` }}
              />
              <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-2 py-1 text-[11px] text-white ring-1 ring-white/10 group-hover:block">
                {formatMoney(s.revenueCents)} · {s.transfers} transfers
              </div>
              <div className="mt-1 text-center text-[9px] text-slate-600">
                {i % 5 === 0 ? s.day.slice(5) : ""}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <h2 className="text-lg font-bold">Where the fees come from</h2>
          <div className="mt-4 space-y-3">
            {stats.byCategory.map((c) => {
              const maxCat = Math.max(...stats.byCategory.map((x) => x.revenueCents), 1);
              const meta = categoryMeta(c.category);
              return (
                <div key={c.category} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm text-slate-300">
                    {meta.emoji} {meta.label.split(" ")[0]}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-lime-400/80"
                      style={{ width: `${(c.revenueCents / maxCat) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold text-white">
                    {formatMoney(c.revenueCents)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <h2 className="text-lg font-bold">Unit economics</h2>
          <p className="mt-1 text-sm text-slate-500">
            A completed transfer currently contributes about {formatMoney(feePerTransfer)} in platform
            fees on average, before operating costs and exception handling.
          </p>
          <div className="mt-5 space-y-2">
            {scale.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-white">{s.label}</div>
                  <div className="text-xs text-slate-500">
                    {s.transfers.toLocaleString("en-US")} transfers
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lime-300">{formatMoney(s.revenue)}</div>
                  <div className="text-[11px] text-slate-500">
                    {formatMoney(s.revenue * 12)} / yr
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass rounded-3xl p-6">
          <h2 className="text-lg font-bold">Latest settled fees</h2>
          <div className="mt-4 divide-y divide-white/5">
            {stats.recent.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate text-slate-200">{t.title ?? "Priority boost"}</div>
                  <div className="text-xs text-slate-500">
                    {t.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-lime-300">+{formatMoney(t.feeCents)}</div>
                  <div className="text-[11px] text-slate-500">
                    on {formatMoney(t.grossCents)}
                    {t.kind === "boost" ? " · boost" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <h2 className="text-lg font-bold">Marketplace health</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              { k: "Live listings", v: String(stats.liveListings) },
              { k: "Completed transfers", v: stats.completedTransfers.toLocaleString("en-US") },
              { k: "Transfers in last 7 days", v: String(stats.completedLast7d) },
              { k: "Sellers who listed", v: String(stats.activeSellers) },
              { k: "Registered users", v: String(stats.totalUsers) },
              { k: "Average buyer discount", v: `${stats.avgDiscountPct}%` },
            ].map((r) => (
              <div key={r.k} className="flex justify-between border-b border-white/5 pb-2">
                <dt className="text-slate-500">{r.k}</dt>
                <dd className="font-semibold text-white">{r.v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex gap-3">
            <Link
              href="/sell"
              className="flex-1 rounded-xl bg-lime-400 py-2.5 text-center text-sm font-semibold text-ink-950 hover:bg-lime-300"
            >
              List a booking
            </Link>
            <Link
              href="/browse"
              className="flex-1 rounded-xl border border-white/15 py-2.5 text-center text-sm text-slate-200 hover:border-white/40"
            >
              Browse
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
