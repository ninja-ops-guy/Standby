"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/money";

type DisputeRow = {
  id: number;
  marketplaceTransactionId: number;
  reasonCode: string;
  status: string;
};

type HoldRow = {
  id: number;
  marketplaceTransactionId: number;
  amountCents: number;
  reason: string;
};

type RefundRow = {
  id: number;
  marketplaceTransactionId: number;
  amountCents: number;
  status: string;
  proposedByUserId: number;
};

async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json()) as { ok?: boolean; error?: string };
  if (!response.ok || !data.ok) throw new Error(data.error ?? "Operation failed.");
  return data;
}

export function AdminControls({
  disputes,
  holds,
  refunds,
  operatorUserId,
}: {
  disputes: DisputeRow[];
  holds: HoldRow[];
  refunds: RefundRow[];
  operatorUserId: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage("Action completed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {message && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          {message}
        </div>
      )}

      <section>
        <h2 className="text-xl font-bold">Open disputes</h2>
        <div className="mt-3 space-y-2">
          {disputes.length === 0 ? (
            <p className="text-sm text-slate-500">No open disputes.</p>
          ) : (
            disputes.map((d) => (
              <div key={d.id} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">Dispute #{d.id} · transaction #{d.marketplaceTransactionId}</div>
                  <div className="text-xs text-slate-500">{d.reasonCode} · {d.status}</div>
                </div>
                <button
                  disabled={busy !== null}
                  onClick={() =>
                    run(`seller-${d.id}`, () =>
                      postJson(`/api/admin/disputes/${d.id}/resolve`, {
                        outcome: "seller",
                        resolution: "Operator resolved in seller favor after evidence review.",
                      }),
                    )
                  }
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"
                >
                  Resolve seller
                </button>
                <button
                  disabled={busy !== null}
                  onClick={() =>
                    run(`cancel-${d.id}`, () =>
                      postJson(`/api/admin/disputes/${d.id}/resolve`, {
                        outcome: "cancelled",
                        resolution: "Operator cancelled dispute after review.",
                      }),
                    )
                  }
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:opacity-40"
                >
                  Cancel dispute
                </button>
              </div>
            ))
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Buyer-favor resolution remains blocked until a refund is actually executed by a qualified payment adapter.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold">Active payout holds</h2>
        <div className="mt-3 space-y-2">
          {holds.length === 0 ? (
            <p className="text-sm text-slate-500">No active holds.</p>
          ) : (
            holds.map((h) => (
              <div key={h.id} className="glass flex items-center gap-3 rounded-2xl p-4">
                <div className="flex-1">
                  <div className="font-medium text-white">
                    {formatMoney(h.amountCents)} · transaction #{h.marketplaceTransactionId}
                  </div>
                  <div className="text-xs text-slate-500">{h.reason}</div>
                </div>
                <button
                  disabled={busy !== null}
                  onClick={() =>
                    run(`hold-${h.id}`, () =>
                      postJson(`/api/admin/payout-holds/${h.id}/release`),
                    )
                  }
                  className="rounded-xl bg-lime-400 px-3 py-2 text-xs font-semibold text-ink-950 disabled:opacity-40"
                >
                  Release hold
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Refund decisions</h2>
        <div className="mt-3 space-y-2">
          {refunds.length === 0 ? (
            <p className="text-sm text-slate-500">No pending refund decisions.</p>
          ) : (
            refunds.map((r) => (
              <div key={r.id} className="glass flex items-center gap-3 rounded-2xl p-4">
                <div className="flex-1">
                  <div className="font-medium text-white">
                    {formatMoney(r.amountCents)} · transaction #{r.marketplaceTransactionId}
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.status} · proposed by user #{r.proposedByUserId}
                  </div>
                </div>
                {r.status === "proposed" && (
                  <button
                    disabled={busy !== null || r.proposedByUserId === operatorUserId}
                    onClick={() =>
                      run(`refund-${r.id}`, () =>
                        postJson(`/api/admin/refunds/${r.id}/approve`),
                      )
                    }
                    className="rounded-xl bg-lime-400 px-3 py-2 text-xs font-semibold text-ink-950 disabled:opacity-40"
                    title={
                      r.proposedByUserId === operatorUserId
                        ? "A second operator must approve this refund."
                        : undefined
                    }
                  >
                    Approve
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <RefundProposalForm run={run} busy={busy !== null} />
        <SuspendUserForm run={run} busy={busy !== null} />
        <SuspendListingForm run={run} busy={busy !== null} />
      </section>
    </div>
  );
}

function RefundProposalForm({
  run,
  busy,
}: {
  run: (key: string, action: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [transactionId, setTransactionId] = useState("");
  const [disputeId, setDisputeId] = useState("");
  const [amountCents, setAmountCents] = useState("");
  const [reasonCode, setReasonCode] = useState("buyer_resolution");

  return (
    <form
      className="glass space-y-3 rounded-2xl p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run("refund-proposal", () =>
          postJson("/api/admin/refunds", {
            marketplaceTransactionId: Number(transactionId),
            disputeId: disputeId ? Number(disputeId) : null,
            amountCents: Number(amountCents),
            reasonCode,
          }),
        );
      }}
    >
      <h3 className="font-semibold text-white">Propose refund</h3>
      <input required inputMode="numeric" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Transaction ID" className={inputClass} />
      <input inputMode="numeric" value={disputeId} onChange={(e) => setDisputeId(e.target.value)} placeholder="Dispute ID (optional)" className={inputClass} />
      <input required inputMode="numeric" value={amountCents} onChange={(e) => setAmountCents(e.target.value)} placeholder="Amount in cents" className={inputClass} />
      <input required value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="Reason code" className={inputClass} />
      <button disabled={busy} className={buttonClass}>Propose</button>
    </form>
  );
}

function SuspendUserForm({
  run,
  busy,
}: {
  run: (key: string, action: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [restrictionType, setRestrictionType] = useState("marketplace_suspension");

  return (
    <form
      className="glass space-y-3 rounded-2xl p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run("suspend-user", () =>
          postJson(`/api/admin/users/${Number(userId)}/suspend`, {
            restrictionType,
            reason,
          }),
        );
      }}
    >
      <h3 className="font-semibold text-white">Suspend user</h3>
      <input required inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" className={inputClass} />
      <select value={restrictionType} onChange={(e) => setRestrictionType(e.target.value)} className={inputClass}>
        <option value="marketplace_suspension">Marketplace suspension</option>
        <option value="payout_suspension">Payout suspension</option>
      </select>
      <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className={inputClass} />
      <button disabled={busy} className={buttonClass}>Suspend</button>
    </form>
  );
}

function SuspendListingForm({
  run,
  busy,
}: {
  run: (key: string, action: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [listingId, setListingId] = useState("");
  const [reason, setReason] = useState("");

  return (
    <form
      className="glass space-y-3 rounded-2xl p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run("suspend-listing", () =>
          postJson(`/api/admin/listings/${Number(listingId)}/suspend`, { reason }),
        );
      }}
    >
      <h3 className="font-semibold text-white">Suspend listing</h3>
      <input required inputMode="numeric" value={listingId} onChange={(e) => setListingId(e.target.value)} placeholder="Listing ID" className={inputClass} />
      <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className={inputClass} />
      <button disabled={busy} className={buttonClass}>Suspend</button>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-lime-400/50";
const buttonClass =
  "w-full rounded-xl bg-lime-400 px-3 py-2 text-sm font-semibold text-ink-950 disabled:opacity-40";
