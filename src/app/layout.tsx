import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Standby — resell the reservations you can't use",
  description:
    "Standby is the peer-to-peer marketplace for non-refundable reservations: hotels, tastings, tee times, classes and shows. Sellers recover cash, buyers save up to 60%.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-full bg-ink-950 text-slate-100 antialiased">
        <div className="grid-glow min-h-screen">
          <SiteNav user={user} />
          <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8">{children}</main>
          <footer className="border-t border-white/10 py-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} Standby Technologies — demo marketplace with simulated money.</span>
              <span>Platform fee 12% · Boost $1.99 · Auto-release 3h after the booking window</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
