import {
  PaymentConfigurationError,
  type PaymentProvider,
  UnconfiguredPaymentProvider,
} from "@/lib/payments/provider";

export function getConfiguredPaymentProvider(): PaymentProvider {
  const configured = process.env.PAYMENT_PROVIDER?.trim();

  if (!configured) return new UnconfiguredPaymentProvider();

  throw new PaymentConfigurationError(
    `Payment provider "${configured}" is configured by name but no production adapter is registered.`,
  );
}
