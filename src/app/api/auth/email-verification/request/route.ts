import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createAuthToken } from "@/lib/auth-tokens";
import {
  EmailConfigurationError,
} from "@/lib/email/provider";
import { getConfiguredEmailProvider } from "@/lib/email/registry";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.emailVerifiedAt) return Response.json({ ok: true, alreadyVerified: true });

  try {
    await enforceRateLimit({
      req,
      scope: "auth:email-verification",
      subject: String(user.id),
      limit: 3,
      windowSeconds: 900,
    });

    const provider = getConfiguredEmailProvider();
    if (provider.name === "unconfigured") {
      throw new EmailConfigurationError("Email delivery is not configured.");
    }

    const token = await createAuthToken(user.id, "email_verification", 60);
    const origin = process.env.APP_ORIGIN;
    if (!origin) throw new EmailConfigurationError("APP_ORIGIN is not configured.");

    const link = `${new URL(origin).origin}/verify-email?token=${encodeURIComponent(token)}`;
    await provider.send({
      to: user.email,
      subject: "Verify your Standby email",
      text: `Verify your Standby email: ${link}`,
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "Too many verification requests." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof EmailConfigurationError) {
      return Response.json({ error: "Email delivery is not configured." }, { status: 503 });
    }

    await db
      .update(users)
      .set({ emailVerifiedAt: user.emailVerifiedAt })
      .where(eq(users.id, user.id));

    return Response.json({ error: "Could not send verification email." }, { status: 500 });
  }
}
