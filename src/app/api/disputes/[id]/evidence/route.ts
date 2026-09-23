import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { addDisputeEvidence } from "@/lib/disputes";

export const dynamic = "force-dynamic";

const EVIDENCE_TYPES = new Set([
  "buyer_statement",
  "seller_statement",
  "provider_response",
  "attachment_digest",
  "operator_note",
]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await ctx.params;
  const disputeId = Number(id);
  const body = (await req.json()) as {
    evidenceType?: string;
    payloadDigest?: string;
    metadataJson?: string;
  };

  if (
    !Number.isInteger(disputeId) ||
    !body.evidenceType ||
    !EVIDENCE_TYPES.has(body.evidenceType) ||
    !body.payloadDigest
  ) {
    return Response.json({ error: "Invalid evidence request." }, { status: 400 });
  }

  try {
    const evidence = await addDisputeEvidence({
      disputeId,
      submittedByUserId: user.id,
      evidenceType: body.evidenceType as
        | "buyer_statement"
        | "seller_statement"
        | "provider_response"
        | "attachment_digest"
        | "operator_note",
      payloadDigest: body.payloadDigest,
      metadataJson: body.metadataJson,
      correlationId: req.headers.get("x-correlation-id") ?? randomUUID(),
    });

    return Response.json({ ok: true, created: Boolean(evidence) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not add evidence." },
      { status: 400 },
    );
  }
}
