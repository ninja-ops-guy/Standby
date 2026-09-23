import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  listingPolicyBindings,
  listings,
  marketplaceTransactions,
  reservationPolicies,
  transactionPolicySnapshots,
  transferEvidence,
  type ReservationPolicy,
} from "@/db/schema";

export const EVIDENCE_TYPES = [
  "provider_receipt",
  "buyer_acknowledgement",
  "seller_submission",
  "operator_verification",
  "provider_response",
  "other",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

const KNOWN_METHODS = new Set([
  "official_digital_transfer",
  "provider_name_change",
  "voucher_credit",
  "confirmation_code",
]);

function parseEvidenceRequirements(raw: string): EvidenceType[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Policy evidence requirements are not valid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("Policy evidence requirements must be an array.");

  const out: EvidenceType[] = [];
  for (const value of parsed) {
    if (typeof value !== "string" || !EVIDENCE_TYPES.includes(value as EvidenceType)) {
      throw new Error(`Unsupported evidence requirement: ${String(value)}`);
    }
    if (!out.includes(value as EvidenceType)) out.push(value as EvidenceType);
  }
  return out;
}

export function evaluatePolicyAdmission(policy: ReservationPolicy) {
  const reasons: string[] = [];
  const requirements = parseEvidenceRequirements(policy.evidenceRequirementsJson);

  if (policy.transferability === "unknown") reasons.push("transferability_unknown");
  if (policy.transferability === "prohibited") reasons.push("transferability_prohibited");
  if (!KNOWN_METHODS.has(policy.transferMethod)) reasons.push("transfer_method_unsupported");
  if (!policy.verifiedAt) reasons.push("policy_not_verified");
  if (policy.sourceType === "unverified") reasons.push("policy_source_unverified");
  if (requirements.length === 0) reasons.push("evidence_requirements_missing");

  return {
    eligible: reasons.length === 0,
    reasons,
    requirements,
  };
}

export async function bindPolicyToListing(input: {
  listingId: number;
  reservationPolicyId: number;
  boundByUserId?: number | null;
  correlationId: string;
}) {
  if (!input.correlationId.trim()) throw new Error("Correlation ID is required.");

  return db.transaction(async (tx) => {
    const [listing] = await tx.select({ id: listings.id }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
    if (!listing) throw new Error("Listing not found.");

    const [policy] = await tx
      .select()
      .from(reservationPolicies)
      .where(eq(reservationPolicies.id, input.reservationPolicyId))
      .limit(1);
    if (!policy) throw new Error("Reservation policy not found.");

    const [binding] = await tx
      .insert(listingPolicyBindings)
      .values({
        listingId: input.listingId,
        reservationPolicyId: input.reservationPolicyId,
        boundByUserId: input.boundByUserId ?? null,
        correlationId: input.correlationId,
      })
      .returning();

    await tx.insert(auditEvents).values({
      actorUserId: input.boundByUserId ?? null,
      action: "listing.transfer_policy.bind",
      targetType: "listing",
      targetId: String(input.listingId),
      correlationId: input.correlationId,
      metadataJson: JSON.stringify({ reservationPolicyId: input.reservationPolicyId }),
    });

    return binding;
  });
}

export async function snapshotPolicyForTransaction(input: {
  marketplaceTransactionId: number;
  correlationId: string;
}) {
  if (!input.correlationId.trim()) throw new Error("Correlation ID is required.");

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        transaction: marketplaceTransactions,
        binding: listingPolicyBindings,
        policy: reservationPolicies,
      })
      .from(marketplaceTransactions)
      .innerJoin(
        listingPolicyBindings,
        eq(listingPolicyBindings.listingId, marketplaceTransactions.listingId),
      )
      .innerJoin(
        reservationPolicies,
        eq(reservationPolicies.id, listingPolicyBindings.reservationPolicyId),
      )
      .where(eq(marketplaceTransactions.id, input.marketplaceTransactionId))
      .limit(1);

    const row = rows[0];
    if (!row) throw new Error("Transaction has no bound transfer policy.");

    const admission = evaluatePolicyAdmission(row.policy);
    if (!admission.eligible) {
      throw new Error(`Transfer policy is not eligible: ${admission.reasons.join(",")}`);
    }

    const inserted = await tx
      .insert(transactionPolicySnapshots)
      .values({
        marketplaceTransactionId: row.transaction.id,
        reservationPolicyId: row.policy.id,
        providerName: row.policy.providerName,
        bookingType: row.policy.bookingType,
        jurisdiction: row.policy.jurisdiction,
        transferability: row.policy.transferability,
        transferMethod: row.policy.transferMethod,
        transferFeeCents: row.policy.transferFeeCents,
        deadlineRule: row.policy.deadlineRule,
        evidenceRequirementsJson: row.policy.evidenceRequirementsJson,
        sourceUrl: row.policy.sourceUrl,
        sourceType: row.policy.sourceType,
        policyVersion: row.policy.policyVersion,
        policyVerifiedAt: row.policy.verifiedAt!,
        correlationId: input.correlationId,
      })
      .onConflictDoNothing({ target: transactionPolicySnapshots.marketplaceTransactionId })
      .returning();

    if (inserted[0]) return inserted[0];

    const [existing] = await tx
      .select()
      .from(transactionPolicySnapshots)
      .where(eq(transactionPolicySnapshots.marketplaceTransactionId, row.transaction.id))
      .limit(1);

    if (!existing) throw new Error("Policy snapshot conflict could not be resolved.");
    if (existing.reservationPolicyId !== row.policy.id) {
      throw new Error("Transaction is already pinned to a different transfer policy.");
    }
    return existing;
  });
}

export async function recordTransferEvidence(input: {
  marketplaceTransactionId: number;
  evidenceType: EvidenceType;
  source: string;
  payloadDigest: string;
  correlationId: string;
  externalReference?: string | null;
  metadataJson?: string;
  verificationStatus?: "pending" | "verified" | "rejected";
  verifiedByUserId?: number | null;
}) {
  if (!EVIDENCE_TYPES.includes(input.evidenceType)) throw new Error("Unsupported evidence type.");
  if (!/^[a-f0-9]{64}$/i.test(input.payloadDigest)) {
    throw new Error("Evidence payload digest must be a SHA-256 hex digest.");
  }
  if (!input.source.trim()) throw new Error("Evidence source is required.");
  if (!input.correlationId.trim()) throw new Error("Correlation ID is required.");

  const status = input.verificationStatus ?? "pending";
  const verifiedAt = status === "verified" ? new Date() : null;

  const inserted = await db
    .insert(transferEvidence)
    .values({
      marketplaceTransactionId: input.marketplaceTransactionId,
      evidenceType: input.evidenceType,
      source: input.source,
      externalReference: input.externalReference ?? null,
      payloadDigest: input.payloadDigest.toLowerCase(),
      metadataJson: input.metadataJson ?? "{}",
      verificationStatus: status,
      verifiedByUserId: input.verifiedByUserId ?? null,
      verifiedAt,
      correlationId: input.correlationId,
    })
    .onConflictDoNothing({
      target: [transferEvidence.marketplaceTransactionId, transferEvidence.payloadDigest],
    })
    .returning();

  if (inserted[0]) return { evidence: inserted[0], created: true as const };

  const [existing] = await db
    .select()
    .from(transferEvidence)
    .where(
      and(
        eq(transferEvidence.marketplaceTransactionId, input.marketplaceTransactionId),
        eq(transferEvidence.payloadDigest, input.payloadDigest.toLowerCase()),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Evidence idempotency conflict could not be resolved.");
  return { evidence: existing, created: false as const };
}

export async function evaluateTransferVerification(marketplaceTransactionId: number) {
  const [snapshot] = await db
    .select()
    .from(transactionPolicySnapshots)
    .where(eq(transactionPolicySnapshots.marketplaceTransactionId, marketplaceTransactionId))
    .limit(1);

  if (!snapshot) {
    return {
      verified: false,
      required: [] as EvidenceType[],
      verifiedEvidenceTypes: [] as EvidenceType[],
      missing: ["policy_snapshot_missing"],
    };
  }

  const required = parseEvidenceRequirements(snapshot.evidenceRequirementsJson);
  const evidence = await db
    .select({ evidenceType: transferEvidence.evidenceType })
    .from(transferEvidence)
    .where(
      and(
        eq(transferEvidence.marketplaceTransactionId, marketplaceTransactionId),
        eq(transferEvidence.verificationStatus, "verified"),
      ),
    );

  const verifiedEvidenceTypes = Array.from(
    new Set(evidence.map((row) => row.evidenceType as EvidenceType)),
  ).filter((value): value is EvidenceType => EVIDENCE_TYPES.includes(value));

  const missing = required.filter((requirement) => !verifiedEvidenceTypes.includes(requirement));

  return {
    verified: missing.length === 0,
    required,
    verifiedEvidenceTypes,
    missing,
  };
}

export async function assertTransferVerifiedForSettlement(marketplaceTransactionId: number) {
  const result = await evaluateTransferVerification(marketplaceTransactionId);
  if (!result.verified) {
    throw new Error(`Transfer verification incomplete: ${result.missing.join(",")}`);
  }
  return result;
}
