import {
  EmailConfigurationError,
  type EmailProvider,
  UnconfiguredEmailProvider,
} from "@/lib/email/provider";

export function getConfiguredEmailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER?.trim();
  if (!configured) return new UnconfiguredEmailProvider();

  throw new EmailConfigurationError(
    `Email provider "${configured}" is configured by name but no production adapter is registered.`,
  );
}
