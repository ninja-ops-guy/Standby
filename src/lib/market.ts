import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { listings, payouts, transactions, users, type Listing } from "@/db/schema";
import {
  BOOST_DURATION_HOURS,
  BOOST_PRICE_CENTS,
  platformFeeCents,
  sellerNetCents,
} from "@/lib/money";

export type ListingWithSeller = {
  id: number;
  title: string;
  venue: string;
  category: string;
  city: string;
  description: string;
  startsAt: Date;
  partySize: number;
  faceValueCents: number;
  priceCents: number;
  status: string;
  views: number;
  createdAt: Date;
  boostedUntil: Date | null;
  isBoosted: boolean;
  ageHours: number;
  sellerId: number;
  sellerName: string;
  buyerId: number | null;
  transferCode: string;
};

const listingColumns = {
  id: listings.id,
  title: listings.title,
  venue: listings.venue,
  category: listings.category,
  city: listings.city,
  description: listings.description,
  startsAt: listings.startsAt,
  partySize: listings.partySize,
  faceValueCents: listings.faceValueCents,
  priceCents: listings.priceCents,
  status: listings.status,
  views: listings.views,
  createdAt: listings.createdAt,
  boostedUntil: listings.boostedUntil,
  isBoosted: sql<boolean>`coalesce(${listings.boostedUntil} > now(), false)`,
  ageHours: sql<number>`greatest(1, floor(extract(epoch from (now() - ${listings.createdAt})) / 3600))::int`,
  sellerId: listings.sellerId,
  sellerName: users.name,
  buyerId: listings.buyerId,
  transferCode: listings.transferCode,
};

function randomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

export type BrowseFilters = {
  q?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  sort?: string;
};

export async function browseListings(filters: BrowseFilters): Promise<ListingWithSeller[]> {
  const conditions = [eq(listings.status, "live"), gte(listings.startsAt, new Date())];
  if (filters.category) conditions.push(eq(listings.category, filters.category));
  if (filters.city) conditions.push(ilike(listings.city, `%${filters.city}%`));
  if (filters.maxPrice) conditions.push(sql`${listings.priceCents} <= ${filters.maxPrice}`);
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(or(ilike(listings.title, like), ilike(listings.venue, like), ilike(listings.city, like))!);
  }

  const order =
    filters.sort === "price"
      ? [asc(listings.priceCents)]
      : filters.sort === "discount"
        ? [asc(sql`${listings.priceCents}::float / NULLIF(${listings.faceValueCents}, 0)`)]
        : [asc(listings.startsAt)];

  const rows = await db
    .select(listingColumns)
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(and(...conditions))
    .orderBy(sql`(${listings.boostedUntil} > now()) DESC NULLS LAST`, ...order)
    .limit(60);

  return rows;
}

export async function getListing(id: number): Promise<ListingWithSeller | null> {
  const rows = await db
    .select(listingColumns)
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(eq(listings.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function incrementViews(id: number): Promise<void> {
  await db.update(listings).set({ views: sql`${listings.views} + 1` }).where(eq(listings.id, id));
}

export async function getUserListings(userId: number, role: "selling" | "buying") {
  const rows = await db
    .select(listingColumns)
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .where(role === "selling" ? eq(listings.sellerId, userId) : eq(listings.buyerId, userId))
    .orderBy(desc(listings.createdAt))
    .limit(50);
  return rows;
}

export async function getWallet(userId: number) {
  const rows = await db
    .select({ balanceCents: users.balanceCents })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.balanceCents ?? 0;
}

export async function getUserTransactions(userId: number) {
  return db
    .select()
    .from(transactions)
    .where(or(eq(transactions.buyerId, userId), eq(transactions.sellerId, userId))!)
    .orderBy(desc(transactions.createdAt))
    .limit(25);
}

export async function getUserPayouts(userId: number) {
  return db.select().from(payouts).where(eq(payouts.userId, userId)).orderBy(desc(payouts.createdAt)).limit(10);
}

export type PlatformStats = {
  gmvCents: number;
  revenueCents: number;
  revenueTodayCents: number;
  revenue7dCents: number;
  revenue30dCents: number;
  monthlyRunRateCents: number;
  annualRunRateCents: number;
  liveListings: number;
  completedTransfers: number;
  completedLast7d: number;
  activeSellers: number;
  totalUsers: number;
  avgDiscountPct: number;
  avgFeeCents: number;
  byCategory: { category: string; revenueCents: number; transfers: number }[];
  recent: {
    id: number;
    title: string | null;
    category: string | null;
    feeCents: number;
    grossCents: number;
    kind: string;
    createdAt: Date;
  }[];
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const since = (ms: number) => new Date(now - ms);

  const [gmvAgg] = await db
    .select({
      gmv: sum(transactions.grossCents).mapWith(Number),
    })
    .from(transactions)
    .where(eq(transactions.kind, "sale"));

  const [revenueAgg] = await db
    .select({
      revenue: sum(transactions.feeCents).mapWith(Number),
    })
    .from(transactions)
    .where(inArray(transactions.kind, ["sale", "boost"]));

  const [saleFeeAgg] = await db
    .select({
      revenue: sum(transactions.feeCents).mapWith(Number),
    })
    .from(transactions)
    .where(eq(transactions.kind, "sale"));

  const windowRevenue = async (ms: number) => {
    const [row] = await db
      .select({ revenue: sum(transactions.feeCents).mapWith(Number) })
      .from(transactions)
      .where(and(inArray(transactions.kind, ["sale", "boost"]), gte(transactions.createdAt, since(ms))));
    return Number(row?.revenue ?? 0);
  };

  const [revenueTodayCents, revenue7dCents, revenue30dCents] = await Promise.all([
    windowRevenue(day),
    windowRevenue(7 * day),
    windowRevenue(30 * day),
  ]);

  const [liveRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(listings)
    .where(eq(listings.status, "live"));

  const [doneRow] = await db
    .select({
      c: sql<number>`count(*)::int`,
      avgDiscount: sql<number>`coalesce(avg(1 - (${listings.priceCents}::float / nullif(${listings.faceValueCents},0))), 0)::float`,
    })
    .from(listings)
    .where(eq(listings.status, "completed"));

  const [done7] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(listings)
    .where(and(eq(listings.status, "completed"), gte(listings.completedAt, since(7 * day))));

  const [sellerRow] = await db
    .select({ c: sql<number>`count(distinct ${listings.sellerId})::int` })
    .from(listings);

  const [userRow] = await db.select({ c: sql<number>`count(*)::int` }).from(users);

  const byCategory = await db
    .select({
      category: listings.category,
      revenueCents: sum(transactions.feeCents).mapWith(Number),
      transfers: sql<number>`count(*) filter (where ${transactions.kind} = 'sale')::int`,
    })
    .from(transactions)
    .leftJoin(listings, eq(listings.id, transactions.listingId))
    .where(inArray(transactions.kind, ["sale", "boost"]))
    .groupBy(listings.category)
    .orderBy(desc(sum(transactions.feeCents)))
    .limit(8);

  const recent = await db
    .select({
      id: transactions.id,
      title: listings.title,
      category: listings.category,
      feeCents: transactions.feeCents,
      grossCents: transactions.grossCents,
      kind: transactions.kind,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(listings, eq(listings.id, transactions.listingId))
    .where(inArray(transactions.kind, ["sale", "boost"]))
    .orderBy(desc(transactions.createdAt))
    .limit(12);

  const revenueCents = Number(revenueAgg?.revenue ?? 0);
  const saleRevenueCents = Number(saleFeeAgg?.revenue ?? 0);
  const completedTransfers = Number(doneRow?.c ?? 0);
  const monthlyRunRateCents = Math.round((revenue7dCents / 7) * 30);

  return {
    gmvCents: Number(gmvAgg?.gmv ?? 0),
    revenueCents,
    revenueTodayCents,
    revenue7dCents,
    revenue30dCents,
    monthlyRunRateCents,
    annualRunRateCents: monthlyRunRateCents * 12,
    liveListings: Number(liveRow?.c ?? 0),
    completedTransfers,
    completedLast7d: Number(done7?.c ?? 0),
    activeSellers: Number(sellerRow?.c ?? 0),
    totalUsers: Number(userRow?.c ?? 0),
    avgDiscountPct: Math.round(Number(doneRow?.avgDiscount ?? 0) * 100),
    avgFeeCents: completedTransfers ? Math.round(saleRevenueCents / completedTransfers) : 0,
    byCategory: byCategory.map((r) => ({
      category: r.category ?? "other",
      revenueCents: Number(r.revenueCents ?? 0),
      transfers: Number(r.transfers ?? 0),
    })),
    recent,
  };
}

export async function getDailyRevenue(days: number) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${transactions.createdAt}), 'YYYY-MM-DD')`,
      revenueCents: sum(transactions.feeCents).mapWith(Number),
      transfers: sql<number>`count(*) filter (where ${transactions.kind} = 'sale')::int`,
    })
    .from(transactions)
    .where(and(inArray(transactions.kind, ["sale", "boost"]), gte(transactions.createdAt, since)))
    .groupBy(sql`date_trunc('day', ${transactions.createdAt})`)
    .orderBy(sql`date_trunc('day', ${transactions.createdAt})`);
  return rows.map((r) => ({
    day: r.day,
    revenueCents: Number(r.revenueCents ?? 0),
    transfers: Number(r.transfers ?? 0),
  }));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export class MarketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketError";
  }
}

export async function createListing(
  sellerId: number,
  input: {
    title: string;
    venue: string;
    category: string;
    city: string;
    description: string;
    startsAt: Date;
    partySize: number;
    faceValueCents: number;
    priceCents: number;
  },
): Promise<number> {
  if (input.priceCents > input.faceValueCents) {
    throw new MarketError("Asking price cannot exceed the face value of the reservation.");
  }
  if (input.startsAt.getTime() <= Date.now()) {
    throw new MarketError("The reservation must start in the future.");
  }
  const [row] = await db
    .insert(listings)
    .values({
      sellerId,
      title: input.title,
      venue: input.venue,
      category: input.category,
      city: input.city,
      description: input.description,
      startsAt: input.startsAt,
      partySize: input.partySize,
      faceValueCents: input.faceValueCents,
      priceCents: input.priceCents,
      transferCode: randomCode(),
      status: "live",
    })
    .returning({ id: listings.id });
  return row.id;
}

export async function claimListing(listingId: number, buyerId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [listing] = await tx.select().from(listings).where(eq(listings.id, listingId)).limit(1);
    if (!listing) throw new MarketError("Listing not found.");
    if (listing.sellerId === buyerId) throw new MarketError("You cannot claim your own reservation.");
    if (listing.status !== "live") throw new MarketError("This reservation is no longer available.");

    const now = new Date();
    if (listing.startsAt.getTime() < now.getTime()) {
      throw new MarketError("This reservation has already passed.");
    }

    const claimed = await tx
      .update(listings)
      .set({ status: "claimed", buyerId, claimedAt: now })
      .where(and(eq(listings.id, listingId), eq(listings.status, "live"), gte(listings.startsAt, now)))
      .returning({ id: listings.id });

    if (claimed.length !== 1) {
      throw new MarketError("This reservation was just claimed by someone else.");
    }

    const debited = await tx
      .update(users)
      .set({
        balanceCents: sql`${users.balanceCents} - ${listing.priceCents}`,
        lifetimeSavedCents: sql`${users.lifetimeSavedCents} + ${listing.faceValueCents - listing.priceCents}`,
      })
      .where(and(eq(users.id, buyerId), gte(users.balanceCents, listing.priceCents)))
      .returning({ id: users.id });

    if (debited.length !== 1) {
      throw new MarketError("Insufficient wallet balance. Top up your demo wallet first.");
    }

    await tx.insert(transactions).values({
      listingId,
      buyerId,
      sellerId: listing.sellerId,
      kind: "escrow_hold",
      grossCents: listing.priceCents,
      feeCents: 0,
      netCents: 0,
      note: "Buyer funds moved into escrow",
    });
  });
}

export async function completeTransfer(
  listingId: number,
  actorId: number,
  auto = false,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [listing] = await tx.select().from(listings).where(eq(listings.id, listingId)).limit(1);
    if (!listing) throw new MarketError("Listing not found.");
    if (listing.status !== "claimed") throw new MarketError("Nothing to release for this reservation.");
    if (!auto && listing.sellerId !== actorId && listing.buyerId !== actorId) {
      throw new MarketError("Only the buyer or seller can release escrow.");
    }

    const completed = await tx
      .update(listings)
      .set({ status: "completed", completedAt: new Date() })
      .where(and(eq(listings.id, listingId), eq(listings.status, "claimed")))
      .returning({ id: listings.id });

    if (completed.length !== 1) {
      throw new MarketError("Escrow has already been released or the listing changed state.");
    }

    const fee = platformFeeCents(listing.priceCents);
    const net = sellerNetCents(listing.priceCents);

    await tx
      .update(users)
      .set({
        balanceCents: sql`${users.balanceCents} + ${net}`,
        lifetimeRecoveredCents: sql`${users.lifetimeRecoveredCents} + ${net}`,
      })
      .where(eq(users.id, listing.sellerId));

    await tx.insert(transactions).values({
      listingId,
      buyerId: listing.buyerId,
      sellerId: listing.sellerId,
      kind: "sale",
      grossCents: listing.priceCents,
      feeCents: fee,
      netCents: net,
      note: auto ? "Auto-released after the reservation window" : "Escrow released — transfer confirmed",
    });
  });
}

export async function cancelListing(listingId: number, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [listing] = await tx.select().from(listings).where(eq(listings.id, listingId)).limit(1);
    if (!listing) throw new MarketError("Listing not found.");
    if (listing.sellerId !== actorId) throw new MarketError("You can only cancel your own listings.");
    const cancelled = await tx
      .update(listings)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(listings.id, listingId),
          eq(listings.sellerId, actorId),
          inArray(listings.status, ["live", "claimed"]),
        ),
      )
      .returning({
        buyerId: listings.buyerId,
        priceCents: listings.priceCents,
        faceValueCents: listings.faceValueCents,
      });

    const cancelledListing = cancelled[0];
    if (!cancelledListing) {
      throw new MarketError("This listing can no longer be cancelled.");
    }

    if (cancelledListing.buyerId) {
      const savedCents = cancelledListing.faceValueCents - cancelledListing.priceCents;
      await tx
        .update(users)
        .set({
          balanceCents: sql`${users.balanceCents} + ${cancelledListing.priceCents}`,
          lifetimeSavedCents: sql`greatest(0, ${users.lifetimeSavedCents} - ${savedCents})`,
        })
        .where(eq(users.id, cancelledListing.buyerId));

      await tx.insert(transactions).values({
        listingId,
        buyerId: cancelledListing.buyerId,
        sellerId: listing.sellerId,
        kind: "refund",
        grossCents: cancelledListing.priceCents,
        feeCents: 0,
        netCents: cancelledListing.priceCents,
        note: "Seller cancelled — escrow returned to buyer",
      });
    }
  });
}

export async function boostListing(listingId: number, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [listing] = await tx.select().from(listings).where(eq(listings.id, listingId)).limit(1);
    if (!listing) throw new MarketError("Listing not found.");
    if (listing.sellerId !== actorId) throw new MarketError("You can only boost your own listings.");
    if (listing.status !== "live") throw new MarketError("Only live listings can be boosted.");

    const charged = await tx
      .update(users)
      .set({ balanceCents: sql`${users.balanceCents} - ${BOOST_PRICE_CENTS}` })
      .where(and(eq(users.id, actorId), gte(users.balanceCents, BOOST_PRICE_CENTS)))
      .returning({ id: users.id });

    if (charged.length !== 1) {
      throw new MarketError("You need at least $1.99 in your wallet to boost.");
    }

    const boosted = await tx
      .update(listings)
      .set({ boostedUntil: new Date(Date.now() + BOOST_DURATION_HOURS * 3600 * 1000) })
      .where(and(eq(listings.id, listingId), eq(listings.status, "live"), eq(listings.sellerId, actorId)))
      .returning({ id: listings.id });

    if (boosted.length !== 1) {
      throw new MarketError("This listing changed state before the boost could be applied.");
    }

    await tx.insert(transactions).values({
      listingId,
      sellerId: actorId,
      kind: "boost",
      grossCents: BOOST_PRICE_CENTS,
      feeCents: BOOST_PRICE_CENTS,
      netCents: 0,
      note: "Priority placement boost (24h)",
    });
  });
}

export async function requestPayout(userId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new MarketError("User not found.");
    if (user.balanceCents <= 0) throw new MarketError("Your wallet is empty.");
    const amount = user.balanceCents;
    await tx.update(users).set({ balanceCents: 0 }).where(eq(users.id, userId));
    await tx.insert(payouts).values({ userId, amountCents: amount, status: "paid", paidAt: new Date() });
    await tx.insert(transactions).values({
      sellerId: userId,
      kind: "payout",
      grossCents: amount,
      feeCents: 0,
      netCents: amount,
      note: "Wallet withdrawn to bank",
    });
    return amount;
  });
}

export async function topUpWallet(userId: number, amountCents: number): Promise<void> {
  await db
    .update(users)
    .set({ balanceCents: sql`${users.balanceCents} + ${amountCents}` })
    .where(eq(users.id, userId));
}

/* ------------------------------------------------------------------ */
/* Maintenance — idempotent expiry and escrow settlement               */
/* ------------------------------------------------------------------ */

/**
 * Expires stale listings and releases eligible escrow. The production
 * scheduler calls this periodically; request paths may also call it as a
 * best-effort fallback. All transitions are guarded so repeated runs are safe.
 */
export async function runMaintenance(): Promise<void> {
  const now = new Date();
  await db
    .update(listings)
    .set({ status: "expired" })
    .where(and(eq(listings.status, "live"), lt(listings.startsAt, now)));

  const autoReleaseCutoff = new Date(now.getTime() - 3 * 3600 * 1000);
  const stale = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.status, "claimed"), lt(listings.startsAt, autoReleaseCutoff)))
    .limit(25);

  for (const row of stale) {
    try {
      await completeTransfer(row.id, 0, true);
    } catch {
      // ignore races
    }
  }
}

export function listingStatusMeta(status: string) {
  switch (status) {
    case "live":
      return { label: "Live", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
    case "claimed":
      return { label: "Escrow held", cls: "bg-amber-100 text-amber-700 ring-amber-200" };
    case "completed":
      return { label: "Transferred", cls: "bg-slate-900 text-white ring-slate-700" };
    case "expired":
      return { label: "Expired", cls: "bg-slate-100 text-slate-500 ring-slate-200" };
    default:
      return { label: "Cancelled", cls: "bg-rose-100 text-rose-700 ring-rose-200" };
  }
}

export type { Listing };
