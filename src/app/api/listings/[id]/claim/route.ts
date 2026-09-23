import { getCurrentUser } from "@/lib/auth";
import { MarketError, claimListing, runMaintenance } from "@/lib/market";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in to claim this reservation." }, { status: 401 });
  const { id } = await ctx.params;

  try {
    await enforceRateLimit({
      req,
      scope: "financial:claim",
      subject: String(user.id),
      limit: 12,
      windowSeconds: 60,
    });
    await runMaintenance();
    await claimListing(Number(id), user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof RateLimitError)
      return Response.json(
        { error: e.message },
        { status: 429, headers: { "Retry-After": String(e.retryAfterSeconds) } },
      );
    if (e instanceof MarketError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: "Claim failed." }, { status: 500 });
  }
}
