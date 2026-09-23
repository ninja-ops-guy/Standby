import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries, marketplaceTransactions } from "@/db/schema";

export type LedgerDirection = "debit" | "credit";

export type AppendLedgerEntryInput = {
  marketplaceTransactionId?: number | null;
  listingId?: number | null;
  userId?: number | null;
  account: string;
  direction: LedgerDirection;
  amountCents: number;
  currency?: string;
  reason: string;
  idempotencyKey: string;
  externalReference?: string | null;
  correlationId: string;
  metadataJson?: string;
};

export async function appendLedgerEntry(input: AppendLedgerEntryInput) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Ledger amount must be a positive integer number of cents.");
  }
  if (!input.idempotencyKey.trim()) throw new Error("Ledger idempotency key is required.");
  if (!input.correlationId.trim()) throw new Error("Ledger correlation ID is required.");

  const rows = await db
    .insert(ledgerEntries)
    .values({
      marketplaceTransactionId: input.marketplaceTransactionId ?? null,
      listingId: input.listingId ?? null,
      userId: input.userId ?? null,
      account: input.account,
      direction: input.direction,
      amountCents: input.amountCents,
      currency: (input.currency ?? "USD").toUpperCase(),
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      externalReference: input.externalReference ?? null,
      correlationId: input.correlationId,
      metadataJson: input.metadataJson ?? "{}",
    })
    .onConflictDoNothing({ target: ledgerEntries.idempotencyKey })
    .returning();

  if (rows[0]) return { entry: rows[0], created: true as const };

  const existing = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing[0]) throw new Error("Ledger idempotency conflict could not be resolved.");
  return { entry: existing[0], created: false as const };
}

export async function getAccountBalanceCents(account: string): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amountCents} else -${ledgerEntries.amountCents} end), 0)::int`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, account));
  return Number(row?.balance ?? 0);
}

export async function getMarketplaceTransaction(id: number) {
  const rows = await db.select().from(marketplaceTransactions).where(eq(marketplaceTransactions.id, id)).limit(1);
  return rows[0] ?? null;
}
