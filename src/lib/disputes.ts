import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accountRestrictions,
  auditEvents,
  disputes,
  disputeEvidence,
  listingRestrictions,
  listings,
  marketplaceTransactions,
  paymentProviderEvents,
  paymentReconciliationFindings,
  payoutHolds,
  refundDecisions,
  transactionStateEvents,
  userRoles,
} from "@/db/schema";
import { canTransition, type TransactionState } from "@/lib/transaction-state";

export type DisputeReason =
  | "transfer_denied"
  | "provider_policy"
  | "invalid_booking"
  | "duplicate_listing"
  | "seller_cancelled"
  | "upstream_cancellation"
  | "buyer_dispute"
  | "other";

export async function openDispute(input: {
  marketplaceTransactionId: number;
  openedByUserId: number;
  reasonCode: DisputeReason;
  correlationId: string;
}) {
  return db.transaction(async (tx) => {
    const [marketplaceTx] = await tx
      .select()
      .from(marketplaceTransactions)
      .where(eq(marketplaceTransactions.id, input.marketplaceTransactionId))
      .limit(1);

    if (!marketplaceTx) throw new Error("Marketplace transaction not found.");
    if (![marketplaceTx.buyerId, marketplaceTx.sellerId].includes(input.openedByUserId)) {
      throw new Error("Only the buyer or seller can open a dispute.");
    }

    const currentState = marketplaceTx.state as TransactionState;
    if (!canTransition(currentState, "disputed")) {
      throw new Error(`Transaction cannot enter dispute from state ${currentState}.`);
    }

    const changed = await tx
      .update(marketplaceTransactions)
      .set({ state: "disputed", updatedAt: new Date() })
      .where(
        and(
          eq(marketplaceTransactions.id, marketplaceTx.id),
          eq(marketplaceTransactions.state, currentState),
        ),
      )
      .returning({ id: marketplaceTransactions.id });

    if (changed.length !== 1) {
      throw new Error("Transaction changed state while dispute was opening.");
    }

    const [dispute] = await tx
      .insert(disputes)
      .values({
        marketplaceTransactionId: marketplaceTx.id,
        openedByUserId: input.openedByUserId,
        reasonCode: input.reasonCode,
        correlationId: input.correlationId,
      })
      .returning();

    await tx.insert(payoutHolds).values({
      marketplaceTransactionId: marketplaceTx.id,
      sellerId: marketplaceTx.sellerId,
      amountCents: marketplaceTx.amountCents,
      reason: `dispute:${input.reasonCode}`,
      createdByUserId: input.openedByUserId,
      correlationId: input.correlationId,
    });

    await tx.insert(transactionStateEvents).values({
      marketplaceTransactionId: marketplaceTx.id,
      fromState: currentState,
      toState: "disputed",
      reason: `dispute:${input.reasonCode}`,
      actorUserId: input.openedByUserId,
      correlationId: input.correlationId,
    });

    await tx.insert(auditEvents).values({
      actorUserId: input.openedByUserId,
      action: "dispute.open",
      targetType: "marketplace_transaction",
      targetId: String(marketplaceTx.id),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({ disputeId: dispute.id, reasonCode: input.reasonCode }),
    });

    return dispute;
  });
}

export async function addDisputeEvidence(input: {
  disputeId: number;
  submittedByUserId: number;
  evidenceType:
    | "buyer_statement"
    | "seller_statement"
    | "provider_response"
    | "attachment_digest"
    | "operator_note";
  payloadDigest: string;
  metadataJson?: string;
  correlationId: string;
}) {
  if (!/^[a-f0-9]{64}$/i.test(input.payloadDigest)) {
    throw new Error("Dispute evidence digest must be SHA-256 hex.");
  }

  const [access] = await db
    .select({
      buyerId: marketplaceTransactions.buyerId,
      sellerId: marketplaceTransactions.sellerId,
    })
    .from(disputes)
    .innerJoin(
      marketplaceTransactions,
      eq(marketplaceTransactions.id, disputes.marketplaceTransactionId),
    )
    .where(eq(disputes.id, input.disputeId))
    .limit(1);

  if (!access) throw new Error("Dispute not found.");

  const participant = [access.buyerId, access.sellerId].includes(input.submittedByUserId);
  const operator = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, input.submittedByUserId),
        inArray(userRoles.role, ["operator", "admin"]),
      ),
    )
    .limit(1);

  if (!participant && !operator[0]) {
    throw new Error("Only a transaction participant or operator can submit dispute evidence.");
  }

  const [row] = await db
    .insert(disputeEvidence)
    .values({
      disputeId: input.disputeId,
      submittedByUserId: input.submittedByUserId,
      evidenceType: input.evidenceType,
      payloadDigest: input.payloadDigest.toLowerCase(),
      metadataJson: input.metadataJson ?? "{}",
      correlationId: input.correlationId,
    })
    .onConflictDoNothing({
      target: [disputeEvidence.disputeId, disputeEvidence.payloadDigest],
    })
    .returning();

  return row ?? null;
}

async function assertOperatorUser(userId: number) {
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), inArray(userRoles.role, ["operator", "admin"])))
    .limit(1);
  if (!roles[0]) throw new Error("Operator authorization required.");
}

export async function proposeRefund(input: {
  marketplaceTransactionId: number;
  disputeId?: number | null;
  amountCents: number;
  reasonCode: string;
  proposedByUserId: number;
  correlationId: string;
}) {
  await assertOperatorUser(input.proposedByUserId);
  return db.transaction(async (tx) => {

    const [marketplaceTx] = await tx
      .select()
      .from(marketplaceTransactions)
      .where(eq(marketplaceTransactions.id, input.marketplaceTransactionId))
      .limit(1);
    if (!marketplaceTx) throw new Error("Marketplace transaction not found.");
    if (input.amountCents <= 0 || input.amountCents > marketplaceTx.amountCents) {
      throw new Error("Refund amount must be positive and no greater than the transaction amount.");
    }

    const [decision] = await tx
      .insert(refundDecisions)
      .values({
        marketplaceTransactionId: input.marketplaceTransactionId,
        disputeId: input.disputeId ?? null,
        amountCents: input.amountCents,
        reasonCode: input.reasonCode,
        proposedByUserId: input.proposedByUserId,
        correlationId: input.correlationId,
      })
      .returning();

    await tx.insert(auditEvents).values({
      actorUserId: input.proposedByUserId,
      action: "refund.propose",
      targetType: "refund_decision",
      targetId: String(decision.id),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({ amountCents: input.amountCents }),
    });

    return decision;
  });
}

export async function approveRefund(input: {
  refundDecisionId: number;
  approvedByUserId: number;
  correlationId: string;
}) {
  await assertOperatorUser(input.approvedByUserId);
  return db.transaction(async (tx) => {

    const [decision] = await tx
      .select()
      .from(refundDecisions)
      .where(eq(refundDecisions.id, input.refundDecisionId))
      .limit(1);
    if (!decision) throw new Error("Refund decision not found.");
    if (decision.status !== "proposed") throw new Error("Refund is not awaiting approval.");
    if (decision.proposedByUserId === input.approvedByUserId) {
      throw new Error("Refund approval requires a second operator.");
    }

    const [approved] = await tx
      .update(refundDecisions)
      .set({
        status: "approved",
        approvedByUserId: input.approvedByUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(refundDecisions.id, decision.id), eq(refundDecisions.status, "proposed")))
      .returning();

    if (!approved) throw new Error("Refund decision changed before approval.");

    await tx.insert(auditEvents).values({
      actorUserId: input.approvedByUserId,
      action: "refund.approve",
      targetType: "refund_decision",
      targetId: String(decision.id),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({ proposedByUserId: decision.proposedByUserId }),
    });

    return approved;
  });
}

export async function releasePayoutHold(input: {
  payoutHoldId: number;
  releasedByUserId: number;
  correlationId: string;
}) {
  await assertOperatorUser(input.releasedByUserId);
  return db.transaction(async (tx) => {

    const [released] = await tx
      .update(payoutHolds)
      .set({
        status: "released",
        releasedByUserId: input.releasedByUserId,
        releasedAt: new Date(),
      })
      .where(and(eq(payoutHolds.id, input.payoutHoldId), eq(payoutHolds.status, "active")))
      .returning();

    if (!released) throw new Error("Payout hold not found or already released.");

    await tx.insert(auditEvents).values({
      actorUserId: input.releasedByUserId,
      action: "payout_hold.release",
      targetType: "payout_hold",
      targetId: String(released.id),
      correlationId: input.correlationId,
      metadataJson: "{}",
    });

    return released;
  });
}

export async function suspendUser(input: {
  userId: number;
  restrictionType: "marketplace_suspension" | "payout_suspension";
  reason: string;
  operatorUserId: number;
  correlationId: string;
}) {
  await assertOperatorUser(input.operatorUserId);
  return db.transaction(async (tx) => {
    const [restriction] = await tx
      .insert(accountRestrictions)
      .values({
        userId: input.userId,
        restrictionType: input.restrictionType,
        reason: input.reason,
        createdByUserId: input.operatorUserId,
        correlationId: input.correlationId,
      })
      .returning();

    await tx.insert(auditEvents).values({
      actorUserId: input.operatorUserId,
      action: "account.restrict",
      targetType: "user",
      targetId: String(input.userId),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({ restrictionType: input.restrictionType, reason: input.reason }),
    });
    return restriction;
  });
}

export async function suspendListing(input: {
  listingId: number;
  reason: string;
  operatorUserId: number;
  correlationId: string;
}) {
  await assertOperatorUser(input.operatorUserId);
  return db.transaction(async (tx) => {
    const [listing] = await tx.select({ id: listings.id }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
    if (!listing) throw new Error("Listing not found.");

    const [restriction] = await tx
      .insert(listingRestrictions)
      .values({
        listingId: input.listingId,
        reason: input.reason,
        createdByUserId: input.operatorUserId,
        correlationId: input.correlationId,
      })
      .returning();

    await tx.insert(auditEvents).values({
      actorUserId: input.operatorUserId,
      action: "listing.restrict",
      targetType: "listing",
      targetId: String(input.listingId),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({ reason: input.reason }),
    });
    return restriction;
  });
}

export async function resolveDispute(input: {
  disputeId: number;
  outcome: "buyer" | "seller" | "cancelled";
  operatorUserId: number;
  resolution: string;
  correlationId: string;
}) {
  await assertOperatorUser(input.operatorUserId);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        dispute: disputes,
        transaction: marketplaceTransactions,
      })
      .from(disputes)
      .innerJoin(
        marketplaceTransactions,
        eq(marketplaceTransactions.id, disputes.marketplaceTransactionId),
      )
      .where(eq(disputes.id, input.disputeId))
      .limit(1);

    if (!row) throw new Error("Dispute not found.");
    if (!["open", "evidence_requested", "under_review"].includes(row.dispute.status)) {
      throw new Error("Dispute is not open for resolution.");
    }

    if (input.outcome === "buyer") {
      const [refund] = await tx
        .select({ status: refundDecisions.status })
        .from(refundDecisions)
        .where(eq(refundDecisions.marketplaceTransactionId, row.transaction.id))
        .limit(1);

      if (!refund || refund.status !== "executed") {
        throw new Error("Buyer-favor resolution requires an executed refund.");
      }
    }

    if (input.outcome === "seller") {
      const [activeHold] = await tx
        .select({ id: payoutHolds.id })
        .from(payoutHolds)
        .where(
          and(
            eq(payoutHolds.marketplaceTransactionId, row.transaction.id),
            eq(payoutHolds.status, "active"),
          ),
        )
        .limit(1);

      if (activeHold) {
        await tx
          .update(payoutHolds)
          .set({
            status: "released",
            releasedByUserId: input.operatorUserId,
            releasedAt: new Date(),
          })
          .where(and(eq(payoutHolds.id, activeHold.id), eq(payoutHolds.status, "active")));
      }
    }

    const nextStatus =
      input.outcome === "buyer"
        ? "resolved_buyer"
        : input.outcome === "seller"
          ? "resolved_seller"
          : "cancelled";

    const [resolved] = await tx
      .update(disputes)
      .set({
        status: nextStatus,
        resolution: input.resolution,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(disputes.id, row.dispute.id),
          inArray(disputes.status, ["open", "evidence_requested", "under_review"]),
        ),
      )
      .returning();

    if (!resolved) throw new Error("Dispute changed before resolution.");

    await tx.insert(auditEvents).values({
      actorUserId: input.operatorUserId,
      action: "dispute.resolve",
      targetType: "dispute",
      targetId: String(input.disputeId),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({
        outcome: input.outcome,
        resolution: input.resolution,
      }),
    });

    return resolved;
  });
}

export async function getOperatorDashboard() {
  const [openDisputes, activeHolds, webhookFailures, reconciliation] = await Promise.all([
    db.select().from(disputes).where(inArray(disputes.status, ["open", "evidence_requested", "under_review"])).orderBy(desc(disputes.createdAt)).limit(25),
    db.select().from(payoutHolds).where(eq(payoutHolds.status, "active")).orderBy(desc(payoutHolds.createdAt)).limit(25),
    db.select().from(paymentProviderEvents).where(inArray(paymentProviderEvents.status, ["failed", "dead_letter"])).orderBy(desc(paymentProviderEvents.receivedAt)).limit(25),
    db.select().from(paymentReconciliationFindings).where(eq(paymentReconciliationFindings.status, "open")).orderBy(desc(paymentReconciliationFindings.createdAt)).limit(25),
  ]);

  return { openDisputes, activeHolds, webhookFailures, reconciliation };
}
