import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { openDispute, type DisputeReason } from "@/lib/disputes";

export const dynamic = "force-dynamic";

const REASONS = new Set<DisputeReason>([
  "transfer_denied",
  "provider_policy",
  "invalid_booking",
  "duplicate_listing",
  "seller_cancelled",
  "upstream_cancellation",
  "buyer_dispute",
  "other",
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const body = (await req.json()) as {
    marketplaceTransactionId?: number;
    reasonCode?: string;
  };

  const marketplaceTransactionId = Number(body.marketplaceTransactionId);
  const reasonCode = body.reasonCode as DisputeReason;

  if (!Number.isInteger(marketplaceTransactionId) || !REASONS.has(reasonCode)) {
    return Response.json({ error: "Invalid dispute request." }, { status: 400 });
  }

  try {
    const dispute = await openDispute({
      marketplaceTransactionId,
      openedByUserId: user.id,
      reasonCode,
      correlationId: req.headers.get("x-correlation-id") ?? randomUUID(),
    });
    return Response.json({ ok: true, disputeId: dispute.id });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not open dispute." },
      { status: 400 },
    );
  }
}
