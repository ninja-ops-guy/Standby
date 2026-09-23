import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  try {
    await enforceRateLimit({
      req,
      scope: "auth:login",
      subject: email,
      limit: 10,
      windowSeconds: 60,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "Too many login attempts." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await createSession(user.id);
  return Response.json({
    ok: true,
    name: user.name,
    emailVerified: Boolean(user.emailVerifiedAt),
  });
}
