import { getCurrentUser } from "@/lib/auth";
import { MarketError, boostListing, runMaintenance } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await runMaintenance();
    await boostListing(Number(id), user.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof MarketError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: "Could not boost." }, { status: 500 });
  }
}
