import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "crypto";
import type {
  PaymentOperationResult,
  PaymentProvider,
  PaymentRequest,
  SellerAccountStatus,
  VerifiedWebhookEvent,
} from "@/lib/payments/provider";

function ref(prefix: string, idempotencyKey: string) {
  return `${prefix}_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`;
}

function succeeded(prefix: string, input: PaymentRequest): PaymentOperationResult {
  return {
    providerReference: ref(prefix, input.idempotencyKey),
    status: "succeeded",
  };
}

export class TestPaymentProvider implements PaymentProvider {
  readonly name = "test";

  constructor(private readonly webhookSecret: string) {
    if (!webhookSecret) throw new Error("Test webhook secret is required.");
  }

  async authorizePayment(input: PaymentRequest) {
    return succeeded("auth", input);
  }

  async capturePayment(input: PaymentRequest & { authorizationReference: string }) {
    return succeeded("pay", input);
  }

  async cancelAuthorization(input: PaymentRequest & { authorizationReference: string }) {
    return succeeded("cancel", input);
  }

  async refundPayment(input: PaymentRequest & { paymentReference: string }) {
    return succeeded("refund", input);
  }

  async createSellerTransfer(input: PaymentRequest & { sellerAccountReference: string }) {
    return succeeded("transfer", input);
  }

  async createSellerOnboarding(input: {
    userId: number;
    returnUrl: string;
    refreshUrl: string;
    correlationId: string;
  }) {
    return {
      providerAccountReference: ref("acct", `${input.userId}:${input.correlationId}`),
      onboardingUrl: `https://example.test/onboard/${input.userId}`,
    };
  }

  async getSellerAccountStatus(providerAccountReference: string): Promise<SellerAccountStatus> {
    return {
      providerAccountReference,
      onboardingStatus: "enabled",
      payoutsEnabled: true,
      country: "US",
      currency: "USD",
    };
  }

  async verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<VerifiedWebhookEvent> {
    const supplied = input.headers["x-standby-test-signature"] ?? "";
    const expected = createHmac("sha256", this.webhookSecret).update(input.rawBody).digest("hex");

    const suppliedBuffer = Buffer.from(supplied, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw new Error("Invalid webhook signature.");
    }

    const parsed = JSON.parse(input.rawBody) as {
      id?: unknown;
      type?: unknown;
      data?: unknown;
    };

    if (typeof parsed.id !== "string" || typeof parsed.type !== "string") {
      throw new Error("Webhook event is missing id or type.");
    }

    return {
      provider: this.name,
      eventId: parsed.id,
      eventType: parsed.type,
      signatureDigest: createHash("sha256").update(supplied).digest("hex"),
      payloadDigest: createHash("sha256").update(input.rawBody).digest("hex"),
      normalizedPayload:
        parsed.data && typeof parsed.data === "object"
          ? (parsed.data as Record<string, unknown>)
          : {},
    };
  }
}
