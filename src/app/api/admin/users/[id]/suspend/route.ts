import { randomUUID } from "crypto";
import { suspendUser } from "@/lib/disputes";
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
    const userId = Number(id);
    const body = (await req.json()) as {
      restrictionType?: "marketplace_suspension" | "payout_suspension";
      reason?: string;
    };

    if (
      !Number.isInteger(userId) ||
      !body.restrictionType ||
      !["marketplace_suspension", "payout_suspension"].includes(body.restrictionType) ||
      !body.reason?.trim()
    ) {
      return Response.json({ error: "Invalid suspension." }, { status: 400 });
    }

    const restriction = await suspendUser({
      userId,
      restrictionType: body.restrictionType,
      reason: body.reason.trim(),
      operatorUserId: operator.id,
      correlationId: req.headers.get("x-correlation-id") ?? randomUUID(),
    });

    return Response.json({ ok: true, restrictionId: restriction.id });
  } catch (error) {
    if (error instanceof OperatorAuthorizationError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not suspend user." },
      { status: 400 },
    );
  }
}
