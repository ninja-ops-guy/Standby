import { runMaintenance } from "@/lib/market";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");

  if (process.env.NODE_ENV === "production") {
    if (!cronSecret) {
      return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
    }
    if (authorization !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  await ensureSeeded();
  await runMaintenance();
  return Response.json({ ok: true, ranAt: new Date().toISOString() });
}
