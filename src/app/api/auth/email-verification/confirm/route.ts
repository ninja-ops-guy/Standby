import { verifyEmailWithToken } from "@/lib/auth-tokens";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { token?: string };
  const token = (body.token ?? "").trim();
  if (token.length < 32) return Response.json({ error: "Invalid token." }, { status: 400 });

  try {
    await enforceRateLimit({
      req,
      scope: "auth:email-verification-confirm",
      subject: token.slice(0, 12),
      limit: 8,
      windowSeconds: 900,
    });
    await verifyEmailWithToken(token);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "Too many attempts." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Verification failed." },
      { status: 400 },
    );
  }
}
