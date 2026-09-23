import { createHmac } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests.");
    this.name = "RateLimitError";
  }
}

function getRateLimitSecret() {
  const configured = process.env.RATE_LIMIT_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("RATE_LIMIT_SECRET is required in production.");
  }
  return "standby-development-rate-limit-secret";
}

export function rateLimitIdentity(
  req: Request,
  scope: string,
  subject = "",
): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return createHmac("sha256", getRateLimitSecret())
    .update(`${scope}\0${ip}\0${subject.toLowerCase()}`)
    .digest("hex");
}

export async function enforceRateLimit(input: {
  req: Request;
  scope: string;
  subject?: string;
  limit: number;
  windowSeconds: number;
}) {
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    !Number.isInteger(input.windowSeconds) ||
    input.windowSeconds < 1
  ) {
    throw new Error("Invalid rate-limit configuration.");
  }

  const now = Date.now();
  const windowMs = input.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs * 2);
  const bucketKey = rateLimitIdentity(input.req, input.scope, input.subject ?? "");

  const [bucket] = await db
    .insert(rateLimitBuckets)
    .values({
      bucketKey,
      windowStart,
      count: 1,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.bucketKey, rateLimitBuckets.windowStart],
      set: {
        count: sql`${rateLimitBuckets.count} + 1`,
        expiresAt,
      },
    })
    .returning({ count: rateLimitBuckets.count });

  if (bucket.count > input.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStart.getTime() + windowMs - now) / 1000),
    );
    throw new RateLimitError(retryAfterSeconds);
  }

  return { remaining: Math.max(0, input.limit - bucket.count) };
}
