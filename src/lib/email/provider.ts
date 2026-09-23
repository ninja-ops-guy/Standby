export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ messageReference: string }>;
}

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "unconfigured";

  async send(): Promise<{ messageReference: string }> {
    throw new EmailConfigurationError(
      "No production email provider is configured. Verification and password reset delivery are disabled.",
    );
  }
}
