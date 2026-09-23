import { randomUUID } from "crypto";
import { resolveDispute } from "@/lib/disputes";
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
    const disputeId = Number(id);
    const body = (await req.json()) as {
      outcome?: "buyer" | "seller" | "cancelled";
      resolution?: string;
    };

    if (
      !Number.isInteger(disputeId) ||
      !body.outcome ||
      !["buyer", "seller", "cancelled"].includes(body.outcome) ||
      !body.resolution?.trim()
    ) {
      return Response.json({ error: "Invalid resolution." }, { status: 400 });
    }

    const resolved = await resolveDispute({
      disputeId,
      outcome: body.outcome,
      operatorUserId: operator.id,
      resolution: body.resolution.trim(),
      correlationId: req.headers.get("x-correlation-id") ?? randomUUID(),
    });

    return Response.json({ ok: true, status: resolved.status });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not resolve dispute." },
      { status: 400 },
    );
  }
}
