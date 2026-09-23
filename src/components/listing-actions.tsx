"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, platformFeeCents, sellerNetCents } from "@/lib/money";

type Props = {
  listingId: number;
  status: string;
  isOwner: boolean;
  isBuyer: boolean;
  priceCents: number;
  walletCents: number | null;
};

export function ListingActions({
  listingId,
  status,
  isOwner,
  isBuyer,
  priceCents,
  walletCents,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function call(action: string) {
    setPending(action);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/${action}`, { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Something went wrong.");
    } else {
      setDone(action);
      router.refresh();
    }
    setPending(null);
  }

  const insufficient = walletCents !== null && walletCents < priceCents;

  if (status === "live" && !isOwner) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => call("claim")}
          disabled={pending !== null || insufficient}
          className="w-full rounded-2xl bg-lime-400 py-3.5 text-base font-bold text-ink-950 transition hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending === "claim" ? "Holding in escrow…" : `Claim for ${formatMoney(priceCents)}`}
        </button>
        {insufficient && (
          <p className="text-center text-xs text-rose-300">
            Your wallet holds {formatMoney(walletCents ?? 0)}. Top up from your Wallet page.
          </p>
        )}
        {error && <p className="text-center text-xs text-rose-300">{error}</p>}
        <p className="text-center text-xs text-slate-500">
          Funds are held in escrow and released to the seller once the booking window closes.
        </p>
      </div>
    );
  }

  if (status === "claimed" && (isOwner || isBuyer)) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
          Escrow is holding {formatMoney(priceCents)}. Release it once the transfer is complete.
        </div>
        <button
          onClick={() => call("complete")}
          disabled={pending !== null}
          className="w-full rounded-2xl bg-lime-400 py-3 font-bold text-ink-950 transition hover:bg-lime-300 disabled:opacity-40"
        >
          {pending === "complete" ? "Releasing…" : "Confirm handoff & release escrow"}
        </button>
        {error && <p className="text-center text-xs text-rose-300">{error}</p>}
      </div>
    );
  }

  if (status === "live" && isOwner) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
          You&apos;ll receive{" "}
          <strong className="text-white">{formatMoney(sellerNetCents(priceCents))}</strong> after the{" "}
          {formatMoney(platformFeeCents(priceCents))} platform fee.
        </div>
        <button
          onClick={() => call("boost")}
          disabled={pending !== null}
          className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/10 py-3 font-semibold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-40"
        >
          {pending === "boost" ? "Boosting…" : done === "boost" ? "⚡ Boosted for 24h" : "⚡ Boost for $1.99"}
        </button>
        <button
          onClick={() => call("cancel")}
          disabled={pending !== null}
          className="w-full rounded-2xl border border-white/15 py-2.5 text-sm text-slate-400 transition hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-40"
        >
          {pending === "cancel" ? "Cancelling…" : "Cancel listing"}
        </button>
        {error && <p className="text-center text-xs text-rose-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-slate-400">
      {status === "claimed"
        ? "This booking has been claimed. Waiting on the transfer."
        : status === "completed"
          ? "Transferred. Escrow released to the seller."
          : status === "expired"
            ? "The booking window closed before anyone claimed it."
            : "This listing was withdrawn."}
    </div>
  );
}
