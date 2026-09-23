import { getCurrentUser } from "@/lib/auth";
import { MarketError, createListing, runMaintenance } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in to list a reservation." }, { status: 401 });

  const b = (await req.json()) as Record<string, string>;
  const startsAt = new Date(b.startsAt ?? "");
  if (Number.isNaN(startsAt.getTime()))
    return Response.json({ error: "Pick a valid date and time." }, { status: 400 });

  try {
    await runMaintenance();
    const id = await createListing(user.id, {
      title: (b.title ?? "").trim(),
      venue: (b.venue ?? "").trim(),
      category: b.category ?? "stay",
      city: (b.city ?? "").trim(),
      description: (b.description ?? "").trim(),
      startsAt,
      partySize: Math.max(1, Number(b.partySize ?? 1) || 1),
      faceValueCents: Math.max(100, Math.round(Number(b.faceValueCents ?? 0) * 100)),
      priceCents: Math.max(100, Math.round(Number(b.priceCents ?? 0) * 100)),
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    if (e instanceof MarketError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: "Could not create the listing." }, { status: 500 });
  }
}
