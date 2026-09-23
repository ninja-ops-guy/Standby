import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";

export const SESSION_COOKIE = "standby_session";
const SESSION_DAYS = 30;

export type SafeUser = Omit<User, "passwordHash">;

function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function strip(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  void _passwordHash;
  return rest;
}

export async function createSession(userId: number): Promise<void> {
  const [user] = await db
    .select({ sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("User not found.");

  const store = await cookies();
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous) {
    await db.delete(sessions).where(eq(sessions.token, digestToken(previous)));
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenDigest = digestToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    token: tokenDigest,
    userId,
    expiresAt,
    sessionVersion: user.sessionVersion,
    lastRotatedAt: new Date(),
  });

  store.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE)?.value;
  if (rawToken) {
    await db.delete(sessions).where(eq(sessions.token, digestToken(rawToken)));
  }
  store.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: number): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function bumpSessionVersionAndRevoke(userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new Error("User not found.");

    await tx
      .update(users)
      .set({ sessionVersion: user.sessionVersion + 1 })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  try {
    const store = await cookies();
    const rawToken = store.get(SESSION_COOKIE)?.value;
    if (!rawToken) return null;

    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.token, digestToken(rawToken)),
          gt(sessions.expiresAt, new Date()),
          eq(sessions.sessionVersion, users.sessionVersion),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return strip(row.user);
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export function requireVerifiedEmail(user: SafeUser): void {
  if (!user.emailVerifiedAt) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
  }
}

export async function listRecentSessionUsers(): Promise<number> {
  const rows = await db
    .select({ id: sessions.userId })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        gt(sessions.expiresAt, new Date()),
        eq(sessions.sessionVersion, users.sessionVersion),
      ),
    );
  return new Set(rows.map((r) => r.id)).size;
}
