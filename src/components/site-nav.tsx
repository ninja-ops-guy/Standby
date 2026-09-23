"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { SafeUser } from "@/lib/auth";

const LINKS = [
  { href: "/browse", label: "Browse" },
  { href: "/sell", label: "Sell a booking" },
  { href: "/dashboard", label: "Wallet" },
  { href: "/revenue", label: "Revenue engine" },
];

export function SiteNav({ user }: { user: SafeUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
    setBusy(false);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-lime-400 text-sm font-black text-ink-950">
            SB
          </span>
          <span className="text-lg font-bold tracking-tight">Standby</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1.5 text-sm font-semibold text-lime-300 sm:inline">
                {formatMoney(user.balanceCents)}
              </span>
              <span className="hidden text-sm text-slate-400 lg:inline">{user.name}</span>
              <button
                onClick={logout}
                disabled={busy}
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-white/40 hover:text-white disabled:opacity-50"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-300 transition hover:border-white/40 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/login?mode=signup"
                className="rounded-full bg-lime-400 px-4 py-1.5 text-sm font-semibold text-ink-950 transition hover:bg-lime-300"
              >
                Get $250 credit
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto px-5 pb-3 md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="whitespace-nowrap rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
