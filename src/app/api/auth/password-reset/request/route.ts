import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAuthToken } from "@/lib/auth-tokens";
import {
  EmailConfigurationError,
} from "@/lib/email/provider";
import { getConfiguredEmailProvider } from "@/lib/email/registry";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  try {
    await enforceRateLimit({
      req,
      scope: "auth:password-reset",
      subject: email,
      limit: 5,
      windowSeconds: 900,
    });

    const provider = getConfiguredEmailProvider();
    if (provider.name === "unconfigured") {
      throw new EmailConfigurationError("Email delivery is not configured.");
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      const token = await createAuthToken(user.id, "password_reset", 30);
      const origin = process.env.APP_ORIGIN;
      if (!origin) throw new EmailConfigurationError("APP_ORIGIN is not configured.");

      const link = `${new URL(origin).origin}/reset-password?token=${encodeURIComponent(token)}`;
      await provider.send({
        to: user.email,
        subject: "Reset your Standby password",
        text: `Reset your Standby password: ${link}`,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "Too many reset requests." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof EmailConfigurationError) {
      return Response.json({ error: "Email delivery is not configured." }, { status: 503 });
    }
    return Response.json({ ok: true });
  }
}
