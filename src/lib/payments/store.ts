import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  paymentOperations,
  paymentProviderEvents,
  paymentReconciliationFindings,
  sellerPaymentAccounts,
} from "@/db/schema";
import type {
  PaymentOperationKind,
  PaymentOperationResult,
  SellerAccountStatus,
  VerifiedWebhookEvent,
} from "@/lib/payments/provider";

export async function upsertSellerPaymentAccount(input: {
  userId: number;
  provider: string;
  status: SellerAccountStatus;
  metadataJson?: string;
}) {
  const rows = await db
    .insert(sellerPaymentAccounts)
    .values({
      userId: input.userId,
      provider: input.provider,
      providerAccountReference: input.status.providerAccountReference,
      onboardingStatus: input.status.onboardingStatus,
      payoutsEnabled: input.status.payoutsEnabled,
      country: input.status.country,
      currency: input.status.currency.toUpperCase(),
      metadataJson: input.metadataJson ?? "{}",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [sellerPaymentAccounts.userId, sellerPaymentAccounts.provider],
      set: {
        providerAccountReference: input.status.providerAccountReference,
        onboardingStatus: input.status.onboardingStatus,
        payoutsEnabled: input.status.payoutsEnabled,
        country: input.status.country,
        currency: input.status.currency.toUpperCase(),
        metadataJson: input.metadataJson ?? "{}",
        updatedAt: new Date(),
      },
    })
    .returning();

  return rows[0];
}

export async function startPaymentOperation(input: {
  marketplaceTransactionId: number;
  provider: string;
  operation: PaymentOperationKind;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  correlationId: string;
  metadataJson?: string;
}) {
  if (!input.idempotencyKey.trim()) throw new Error("Payment idempotency key is required.");
  if (!input.correlationId.trim()) throw new Error("Correlation ID is required.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Payment amount must be a positive integer number of cents.");
  }

  const inserted = await db
    .insert(paymentOperations)
    .values({
      marketplaceTransactionId: input.marketplaceTransactionId,
      provider: input.provider,
      operation: input.operation,
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
      metadataJson: input.metadataJson ?? "{}",
    })
    .onConflictDoNothing({ target: paymentOperations.idempotencyKey })
    .returning();

  if (inserted[0]) return { operation: inserted[0], created: true as const };

  const [existing] = await db
    .select()
    .from(paymentOperations)
    .where(eq(paymentOperations.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (!existing) throw new Error("Payment idempotency conflict could not be resolved.");

  const materialMismatch =
    existing.marketplaceTransactionId !== input.marketplaceTransactionId ||
    existing.provider !== input.provider ||
    existing.operation !== input.operation ||
    existing.amountCents !== input.amountCents ||
    existing.currency !== input.currency.toUpperCase();

  if (materialMismatch) {
    throw new Error("Payment idempotency key was reused with different operation parameters.");
  }

  return { operation: existing, created: false as const };
}

export async function finishPaymentOperation(
  id: number,
  result: PaymentOperationResult,
) {
  const changed = await db
    .update(paymentOperations)
    .set({
      state: result.status,
      providerReference: result.providerReference,
      failureCode: result.failureCode ?? null,
      failureMessage: result.failureMessage ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(paymentOperations.id, id), eq(paymentOperations.state, "pending")))
    .returning();

  if (changed[0]) return changed[0];

  const [existing] = await db.select().from(paymentOperations).where(eq(paymentOperations.id, id)).limit(1);
  if (!existing) throw new Error("Payment operation not found.");

  if (
    existing.state !== result.status ||
    existing.providerReference !== result.providerReference
  ) {
    throw new Error("Payment operation already completed with a different result.");
  }

  return existing;
}

export async function recordVerifiedWebhookEvent(
  event: VerifiedWebhookEvent,
  correlationId: string,
) {
  const inserted = await db
    .insert(paymentProviderEvents)
    .values({
      provider: event.provider,
      providerEventId: event.eventId,
      eventType: event.eventType,
      signatureDigest: event.signatureDigest,
      payloadDigest: event.payloadDigest,
      normalizedPayloadJson: JSON.stringify(event.normalizedPayload),
      correlationId,
    })
    .onConflictDoNothing({
      target: [paymentProviderEvents.provider, paymentProviderEvents.providerEventId],
    })
    .returning();

  if (inserted[0]) return { event: inserted[0], created: true as const };

  const [existing] = await db
    .select()
    .from(paymentProviderEvents)
    .where(
      and(
        eq(paymentProviderEvents.provider, event.provider),
        eq(paymentProviderEvents.providerEventId, event.eventId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Webhook replay conflict could not be resolved.");
  if (
    existing.payloadDigest !== event.payloadDigest ||
    existing.signatureDigest !== event.signatureDigest
  ) {
    throw new Error("Provider event ID replayed with different signed content.");
  }

  return { event: existing, created: false as const };
}

export async function claimWebhookEvent(id: number, maxAttempts = 5) {
  const changed = await db
    .update(paymentProviderEvents)
    .set({
      status: "processing",
      attempts: sql`${paymentProviderEvents.attempts} + 1`,
      lastError: null,
    })
    .where(
      and(
        eq(paymentProviderEvents.id, id),
        inArray(paymentProviderEvents.status, ["received", "failed"]),
        lt(paymentProviderEvents.attempts, maxAttempts),
      ),
    )
    .returning();

  return changed[0] ?? null;
}

export async function completeWebhookEvent(id: number) {
  const changed = await db
    .update(paymentProviderEvents)
    .set({ status: "processed", processedAt: new Date(), lastError: null })
    .where(and(eq(paymentProviderEvents.id, id), eq(paymentProviderEvents.status, "processing")))
    .returning();
  if (!changed[0]) throw new Error("Webhook event is not in processing state.");
  return changed[0];
}

export async function failWebhookEvent(id: number, error: string, maxAttempts = 5) {
  const [current] = await db
    .select()
    .from(paymentProviderEvents)
    .where(eq(paymentProviderEvents.id, id))
    .limit(1);
  if (!current) throw new Error("Webhook event not found.");
  if (current.status !== "processing") throw new Error("Webhook event is not in processing state.");

  const deadLetter = current.attempts >= maxAttempts;
  const delaySeconds = Math.min(3600, 30 * 2 ** Math.max(0, current.attempts - 1));

  const [changed] = await db
    .update(paymentProviderEvents)
    .set({
      status: deadLetter ? "dead_letter" : "failed",
      lastError: error.slice(0, 2000),
      nextAttemptAt: deadLetter ? null : new Date(Date.now() + delaySeconds * 1000),
    })
    .where(and(eq(paymentProviderEvents.id, id), eq(paymentProviderEvents.status, "processing")))
    .returning();

  return changed;
}

export async function recordReconciliationFinding(input: {
  provider: string;
  marketplaceTransactionId?: number | null;
  externalReference: string;
  findingType:
    | "missing_local"
    | "missing_provider"
    | "amount_mismatch"
    | "state_mismatch"
    | "duplicate"
    | "other";
  expectedJson?: string;
  observedJson?: string;
  correlationId: string;
}) {
  const [finding] = await db
    .insert(paymentReconciliationFindings)
    .values({
      provider: input.provider,
      marketplaceTransactionId: input.marketplaceTransactionId ?? null,
      externalReference: input.externalReference,
      findingType: input.findingType,
      expectedJson: input.expectedJson ?? "{}",
      observedJson: input.observedJson ?? "{}",
      correlationId: input.correlationId,
    })
    .returning();

  return finding;
}
