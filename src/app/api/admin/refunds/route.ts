import { randomUUID } from "crypto";
import { proposeRefund } from "@/lib/disputes";
import {
  OperatorAuthorizationError,
  requireOperatorUser,
} from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const operator = await requireOperatorUser();
    const body = (await req.json()) as {
      marketplaceTransactionId?: number;
      disputeId?: number | null;
      amountCents?: number;
      reasonCode?: string;
    };

    const marketplaceTransactionId = Number(body.marketplaceTransactionId);
    const amountCents = Number(body.amountCents);
    if (
      !Number.isInteger(marketplaceTransactionId) ||
      !Number.isInteger(amountCents) ||
      amountCents <= 0 ||
      !body.reasonCode?.trim()
    ) {
      return Response.json({ error: "Invalid refund proposal." }, { status: 400 });
    }

    const decision = await proposeRefund({
      marketplaceTransactionId,
      disputeId: body.disputeId ? Number(body.disputeId) : null,
      amountCents,
      reasonCode: body.reasonCode.trim(),
      proposedByUserId: operator.id,
      correlationId: req.headers.get("x-correlation-id") ?? randomUUID(),
    });

    return Response.json({ ok: true, refundDecisionId: decision.id });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not propose refund." },
      { status: 400 },
    );
  }
}
