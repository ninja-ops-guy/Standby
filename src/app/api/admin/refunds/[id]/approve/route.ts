import { randomUUID } from "crypto";
import { approveRefund } from "@/lib/disputes";
import {
  OperatorAuthorizationError,
  requireOperatorUser,
} from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const operator = await requireOperatorUser();
    const { id } = await ctx.params;
    const refundDecisionId = Number(id);
    if (!Number.isInteger(refundDecisionId)) {
      return Response.json({ error: "Invalid refund decision." }, { status: 400 });
    }

    const approved = await approveRefund({
      refundDecisionId,
      approvedByUserId: operator.id,
      correlationId: req.headers.get("x-correlation-id") ?? randomUUID(),
    });
    return Response.json({ ok: true, status: approved.status });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not approve refund." },
      { status: 400 },
    );
  }
}
