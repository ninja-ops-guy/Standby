import { getConfiguredPaymentProvider } from "@/lib/payments/registry";
import {
  PaymentConfigurationError,
} from "@/lib/payments/provider";
import { recordVerifiedWebhookEvent } from "@/lib/payments/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider: requestedProvider } = await ctx.params;

  try {
    const provider = getConfiguredPaymentProvider();
    if (provider.name !== requestedProvider) {
      return Response.json({ error: "Unknown payment provider." }, { status: 404 });
    }

    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const verified = await provider.verifyWebhook({ rawBody, headers });

    const correlationId =
      req.headers.get("x-correlation-id") ??
      `webhook:${verified.provider}:${verified.eventId}`;

    const stored = await recordVerifiedWebhookEvent(verified, correlationId);

    return Response.json({
      ok: true,
      accepted: stored.created,
      replay: !stored.created,
    });
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      return Response.json(
        { error: "Payment processing is not configured." },
        { status: 503 },
      );
    }

    return Response.json(
      { error: "Webhook verification failed." },
      { status: 400 },
    );
  }
}
