export type PaymentOperationKind =
  | "authorize"
  | "capture"
  | "cancel_authorization"
  | "refund"
  | "seller_transfer";

export type PaymentOperationResult = {
  providerReference: string;
  status: "succeeded" | "failed";
  failureCode?: string;
  failureMessage?: string;
};

export type SellerAccountStatus = {
  providerAccountReference: string;
  onboardingStatus: "pending" | "restricted" | "enabled" | "disabled";
  payoutsEnabled: boolean;
  country: string;
  currency: string;
};

export type VerifiedWebhookEvent = {
  provider: string;
  eventId: string;
  eventType: string;
  signatureDigest: string;
  payloadDigest: string;
  normalizedPayload: Record<string, unknown>;
};

export type PaymentRequest = {
  marketplaceTransactionId: number;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  correlationId: string;
};

export interface PaymentProvider {
  readonly name: string;

  authorizePayment(input: PaymentRequest): Promise<PaymentOperationResult>;
  capturePayment(input: PaymentRequest & { authorizationReference: string }): Promise<PaymentOperationResult>;
  cancelAuthorization(input: PaymentRequest & { authorizationReference: string }): Promise<PaymentOperationResult>;
  refundPayment(input: PaymentRequest & { paymentReference: string }): Promise<PaymentOperationResult>;
  createSellerTransfer(
    input: PaymentRequest & { sellerAccountReference: string },
  ): Promise<PaymentOperationResult>;

  createSellerOnboarding(input: {
    userId: number;
    returnUrl: string;
    refreshUrl: string;
    correlationId: string;
  }): Promise<{ providerAccountReference: string; onboardingUrl: string }>;

  getSellerAccountStatus(providerAccountReference: string): Promise<SellerAccountStatus>;

  verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string>;
  }): Promise<VerifiedWebhookEvent>;
}

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

export class UnconfiguredPaymentProvider implements PaymentProvider {
  readonly name = "unconfigured";

  private fail(): never {
    throw new PaymentConfigurationError(
      "No production payment provider adapter is configured. Real money operations are disabled.",
    );
  }

  authorizePayment(): Promise<PaymentOperationResult> { return Promise.reject(this.fail()); }
  capturePayment(): Promise<PaymentOperationResult> { return Promise.reject(this.fail()); }
  cancelAuthorization(): Promise<PaymentOperationResult> { return Promise.reject(this.fail()); }
  refundPayment(): Promise<PaymentOperationResult> { return Promise.reject(this.fail()); }
  createSellerTransfer(): Promise<PaymentOperationResult> { return Promise.reject(this.fail()); }
  createSellerOnboarding(): Promise<{ providerAccountReference: string; onboardingUrl: string }> {
    return Promise.reject(this.fail());
  }
  getSellerAccountStatus(): Promise<SellerAccountStatus> { return Promise.reject(this.fail()); }
  verifyWebhook(): Promise<VerifiedWebhookEvent> { return Promise.reject(this.fail()); }
}
