import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  marketplaceTransactions,
  transactionStateEvents,
} from "@/db/schema";
import { assertTransition, type TransactionState } from "@/lib/transaction-state";

export async function createMarketplaceTransaction(input: {
  listingId: number;
  buyerId: number;
  sellerId: number;
  amountCents: number;
  currency?: string;
  correlationId: string;
}) {
  if (input.amountCents <= 0 || !Number.isInteger(input.amountCents)) {
    throw new Error("Transaction amount must be a positive integer number of cents.");
  }
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(marketplaceTransactions)
      .values({
        listingId: input.listingId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
        amountCents: input.amountCents,
        currency: (input.currency ?? "USD").toUpperCase(),
        state: "created",
        correlationId: input.correlationId,
      })
      .returning();

    await tx.insert(transactionStateEvents).values({
      marketplaceTransactionId: created.id,
      fromState: null,
      toState: "created",
      reason: "transaction_created",
      correlationId: input.correlationId,
    });

    return created;
  });
}

export async function transitionMarketplaceTransaction(input: {
  id: number;
  expectedState: TransactionState;
  nextState: TransactionState;
  reason: string;
  correlationId: string;
  actorUserId?: number | null;
}) {
  assertTransition(input.expectedState, input.nextState);

  return db.transaction(async (tx) => {
    const changed = await tx
      .update(marketplaceTransactions)
      .set({ state: input.nextState, updatedAt: new Date() })
      .where(
        and(
          eq(marketplaceTransactions.id, input.id),
          eq(marketplaceTransactions.state, input.expectedState),
        ),
      )
      .returning();

    if (changed.length !== 1) {
      throw new Error("Transaction state changed concurrently or expected state was incorrect.");
    }

    await tx.insert(transactionStateEvents).values({
      marketplaceTransactionId: input.id,
      fromState: input.expectedState,
      toState: input.nextState,
      reason: input.reason,
      actorUserId: input.actorUserId ?? null,
      correlationId: input.correlationId,
    });

    await tx.insert(auditEvents).values({
      actorUserId: input.actorUserId ?? null,
      action: "marketplace_transaction.transition",
      targetType: "marketplace_transaction",
      targetId: String(input.id),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({
        from: input.expectedState,
        to: input.nextState,
        reason: input.reason,
      }),
    });

    return changed[0];
  });
}
