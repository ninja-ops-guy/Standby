import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import {
  bumpSessionVersionAndRevoke,
  hashPassword,
} from "@/lib/auth";

export type AuthTokenPurpose = "email_verification" | "password_reset";

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthToken(
  userId: number,
  purpose: AuthTokenPurpose,
  ttlMinutes: number,
): Promise<string> {
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 1440) {
    throw new Error("Invalid auth token TTL.");
  }

  await db
    .delete(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));

  const raw = randomBytes(32).toString("hex");
  await db.insert(authTokens).values({
    userId,
    purpose,
    tokenDigest: digest(raw),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return raw;
}

export async function consumeAuthToken(
  rawToken: string,
  purpose: AuthTokenPurpose,
): Promise<number> {
  const tokenDigest = digest(rawToken);

  return db.transaction(async (tx) => {
    const [token] = await tx
      .select()
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenDigest, tokenDigest),
          eq(authTokens.purpose, purpose),
          gt(authTokens.expiresAt, new Date()),
          isNull(authTokens.usedAt),
        ),
      )
      .limit(1);

    if (!token) throw new Error("Invalid or expired token.");

    const [used] = await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.id, token.id), isNull(authTokens.usedAt)))
      .returning({ userId: authTokens.userId });

    if (!used) throw new Error("Token was already used.");
    return used.userId;
  });
}

export async function verifyEmailWithToken(rawToken: string): Promise<void> {
  const userId = await consumeAuthToken(rawToken, "email_verification");
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }

  const userId = await consumeAuthToken(rawToken, "password_reset");
  await db
    .update(users)
    .set({
      passwordHash: hashPassword(newPassword),
      passwordUpdatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await bumpSessionVersionAndRevoke(userId);
}
