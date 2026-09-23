import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions, users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { SIGNUP_BONUS_CENTS } from "@/lib/money";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    email?: string;
    password?: string;
    city?: string;
  };
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const city = (body.city ?? "").trim();

  try {
    await enforceRateLimit({
      req,
      scope: "auth:signup",
      subject: email,
      limit: 5,
      windowSeconds: 600,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "Too many signup attempts." },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  if (name.length < 2) return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 10)
    return Response.json({ error: "Password must be at least 10 characters." }, { status: 400 });

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0)
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });

  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      city,
      passwordHash: hashPassword(password),
      balanceCents: SIGNUP_BONUS_CENTS,
    })
    .returning({ id: users.id });

  await db.insert(transactions).values({
    sellerId: user.id,
    kind: "signup_bonus",
    grossCents: SIGNUP_BONUS_CENTS,
    feeCents: 0,
    netCents: SIGNUP_BONUS_CENTS,
    note: "Welcome credit — demo wallet",
  });

  await createSession(user.id);
  return Response.json({ ok: true, emailVerified: false });
}
