"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/money";

export function WalletActions({ balanceCents }: { balanceCents: number }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(action: string, amountCents?: number) {
    setPending(action);
    setMsg(null);
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, amountCents }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string; amount?: number };
    if (!res.ok || !data.ok) {
      setMsg(data.error ?? "Something went wrong.");
    } else if (action === "payout") {
      setMsg(`Paid out ${formatMoney(data.amount ?? 0)} to your bank.`);
    } else {
      setMsg(`Added ${formatMoney(data.amount ?? 0)} to your wallet.`);
    }
    setPending(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {[5000, 20000, 50000].map((amt) => (
          <button
            key={amt}
            disabled={pending !== null}
            onClick={() => call("topup", amt)}
            className="rounded-xl border border-white/15 px-3 py-2 text-sm text-slate-200 transition hover:border-lime-400/40 hover:text-white disabled:opacity-40"
          >
            +{formatMoney(amt)}
          </button>
        ))}
        <button
          disabled={pending !== null || balanceCents <= 0}
          onClick={() => call("payout")}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-slate-200 disabled:opacity-40"
        >
          {pending === "payout" ? "Sending…" : "Withdraw all"}
        </button>
      </div>
      {msg && <p className="text-xs text-slate-400">{msg}</p>}
    </div>
  );
}
