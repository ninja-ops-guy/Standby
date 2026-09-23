import { db } from "@/db";
import { transactions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { MarketError, requestPayout, topUpWallet } from "@/lib/market";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });

  const body = (await req.json()) as { action?: string; amountCents?: number };

  try {
    await enforceRateLimit({
      req,
      scope: "financial:wallet",
      subject: String(user.id),
      limit: 15,
      windowSeconds: 60,
    });

    if (body.action === "topup") {
      const amount = Math.min(500000, Math.max(1000, Number(body.amountCents ?? 10000)));
      await topUpWallet(user.id, amount);
      await db.insert(transactions).values({
        sellerId: user.id,
        kind: "signup_bonus",
        grossCents: amount,
        feeCents: 0,
        netCents: amount,
        note: "Demo wallet top up",
      });
      return Response.json({ ok: true, amount });
    }

    if (body.action === "payout") {
      const amount = await requestPayout(user.id);
      return Response.json({ ok: true, amount });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof RateLimitError)
      return Response.json(
        { error: e.message },
        { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } },
      );
    if (e instanceof MarketError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: "Wallet action failed." }, { status: 500 });
  }
}

