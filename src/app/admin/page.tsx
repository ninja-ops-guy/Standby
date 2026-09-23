import { notFound, redirect } from "next/navigation";
import { AdminControls } from "@/components/admin-controls";
import { getCurrentUser } from "@/lib/auth";
import { getOperatorDashboard } from "@/lib/disputes";
import { hasOperatorRole } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await hasOperatorRole(user.id))) notFound();

  const dashboard = await getOperatorDashboard();

  return (
    <div className="space-y-10">
      <div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
          Protected operator control plane
        </span>
        <h1 className="mt-4 text-3xl font-black">Standby Operations</h1>
        <p className="mt-2 max-w-3xl text-slate-400">
          Review disputes, freeze or release seller payouts, approve refunds under four-eyes control,
          inspect payment exceptions, and suspend risky users or listings. Every privileged mutation is
          re-authorized server-side and written to the audit log.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Open disputes" value={dashboard.openDisputes.length} />
        <Metric label="Active payout holds" value={dashboard.activeHolds.length} />
        <Metric label="Payment event failures" value={dashboard.webhookFailures.length} />
        <Metric label="Reconciliation findings" value={dashboard.reconciliation.length} />
      </section>

      <AdminControls
        disputes={dashboard.openDisputes.map((d) => ({
          id: d.id,
          marketplaceTransactionId: d.marketplaceTransactionId,
          reasonCode: d.reasonCode,
          status: d.status,
        }))}
        holds={dashboard.activeHolds.map((h) => ({
          id: h.id,
          marketplaceTransactionId: h.marketplaceTransactionId,
          amountCents: h.amountCents,
          reason: h.reason,
        }))}
        refunds={dashboard.pendingRefunds.map((r) => ({
          id: r.id,
          marketplaceTransactionId: r.marketplaceTransactionId,
          amountCents: r.amountCents,
          status: r.status,
          proposedByUserId: r.proposedByUserId,
        }))}
        operatorUserId={user.id}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <ExceptionList
          title="Payment webhook failures"
          rows={dashboard.webhookFailures.map((event) => ({
            key: event.id,
            primary: `${event.provider} · ${event.eventType}`,
            secondary: `${event.status} · attempts ${event.attempts}`,
          }))}
        />
        <ExceptionList
          title="Open reconciliation findings"
          rows={dashboard.reconciliation.map((finding) => ({
            key: finding.id,
            primary: `${finding.provider} · ${finding.findingType}`,
            secondary: finding.externalReference,
          }))}
        />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-3xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ExceptionList({
  title,
  rows,
}: {
  title: string;
  rows: { key: number; primary: string; secondary: string }[];
}) {
  return (
    <div>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">None.</p>
        ) : (
          rows.map((row) => (
            <div key={row.key} className="glass rounded-xl px-4 py-3">
              <div className="text-sm font-medium text-white">{row.primary}</div>
              <div className="text-xs text-slate-500">{row.secondary}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
