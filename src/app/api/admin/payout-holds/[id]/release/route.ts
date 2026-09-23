import { randomUUID } from "crypto";
import { releasePayoutHold } from "@/lib/disputes";
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
    const payoutHoldId = Number(id);
    if (!Number.isInteger(payoutHoldId)) {
      return Response.json({ error: "Invalid payout hold." }, { status: 400 });
    }

    await releasePayoutHold({
      payoutHoldId,
      releasedByUserId: operator.id,
      correlationId: req.headers.get("x-correlation-id") ?? randomUUID(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not release hold." },
      { status: 400 },
    );
  }
}
