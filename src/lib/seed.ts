import { sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, transactions, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { platformFeeCents, sellerNetCents } from "@/lib/money";

type SeedListing = {
  seller: number;
  title: string;
  venue: string;
  category: string;
  city: string;
  description: string;
  hoursAhead: number;
  partySize: number;
  face: number;
  price: number;
};

const SELLERS = [
  { name: "Maya Chen", email: "maya@standby.club", city: "San Francisco" },
  { name: "Devon Park", email: "devon@standby.club", city: "Austin" },
  { name: "Priya Nair", email: "priya@standby.club", city: "New York" },
  { name: "Luis Ortega", email: "luis@standby.club", city: "Miami" },
  { name: "Hana Sato", email: "hana@standby.club", city: "Seattle" },
  { name: "Tom Beck", email: "tom@standby.club", city: "Chicago" },
  { name: "Aisha Rahman", email: "aisha@standby.club", city: "Denver" },
  { name: "Jonas Weber", email: "jonas@standby.club", city: "Boston" },
];

const LIVE_LISTINGS: SeedListing[] = [
  {
    seller: 0,
    title: "Boutique king room, 2 nights",
    venue: "Hotel Vela",
    category: "stay",
    city: "San Francisco",
    description: "Non-refundable prepaid rate. Name on the booking can be changed up to 24h before check-in.",
    hoursAhead: 30,
    partySize: 2,
    face: 68000,
    price: 41000,
  },
  {
    seller: 1,
    title: "Chef's counter tasting menu",
    venue: "Ember & Ash",
    category: "dining",
    city: "Austin",
    description: "Two seats at the 8pm chef's counter. Prepaid, transferable with 12 hours notice.",
    hoursAhead: 14,
    partySize: 2,
    face: 42000,
    price: 26000,
  },
  {
    seller: 2,
    title: "Orchestra seats, symphony premiere",
    venue: "Meridian Hall",
    category: "events",
    city: "New York",
    description: "Row F, seats 12–13. Digital tickets transfer instantly through the venue app.",
    hoursAhead: 52,
    partySize: 2,
    face: 31000,
    price: 21500,
  },
  {
    seller: 3,
    title: "Sunset catamaran charter",
    venue: "Biscayne Sailing Co.",
    category: "sport",
    city: "Miami",
    description: "Private 4-hour charter for up to 6. Weather was perfect, our flight was not.",
    hoursAhead: 20,
    partySize: 6,
    face: 95000,
    price: 58000,
  },
  {
    seller: 4,
    title: "Couples spa suite + massage",
    venue: "Cedar & Salt Spa",
    category: "wellness",
    city: "Seattle",
    description: "90-minute couples treatment plus private sauna. Fully transferable.",
    hoursAhead: 44,
    partySize: 2,
    face: 34000,
    price: 21000,
  },
  {
    seller: 5,
    title: "Private pottery wheel class",
    venue: "Kiln House Studio",
    category: "learning",
    city: "Chicago",
    description: "Saturday 3-hour beginner wheel class, all materials and firing included.",
    hoursAhead: 66,
    partySize: 1,
    face: 12000,
    price: 7000,
  },
  {
    seller: 6,
    title: "Tee time for four, mountain course",
    venue: "Granite Ridge GC",
    category: "sport",
    city: "Denver",
    description: "Saturday 7:40am tee time with cart. Fully paid, name change allowed.",
    hoursAhead: 38,
    partySize: 4,
    face: 46000,
    price: 27000,
  },
  {
    seller: 7,
    title: "Design conference pass (2 days)",
    venue: "Northline Conference Center",
    category: "events",
    city: "Boston",
    description: "Full access pass including workshops. Badge can be reassigned online.",
    hoursAhead: 88,
    partySize: 1,
    face: 89000,
    price: 52000,
  },
  {
    seller: 0,
    title: "Cabin weekend, 3 nights",
    venue: "Tahoe Pines Cabins",
    category: "stay",
    city: "Lake Tahoe",
    description: "Sleeps 6, hot tub, lake view. Booked for a reunion that got moved.",
    hoursAhead: 96,
    partySize: 6,
    face: 120000,
    price: 74500,
  },
  {
    seller: 2,
    title: "Private studio, full month",
    venue: "Canal Street Studios",
    category: "workspace",
    city: "New York",
    description: "Locked-in studio rate through end of month. We outgrew the space.",
    hoursAhead: 120,
    partySize: 4,
    face: 210000,
    price: 129000,
  },
  {
    seller: 4,
    title: "One-way flight credit, SEA → NRT",
    venue: "Airline voucher",
    category: "travel",
    city: "Seattle",
    description: "Transferable airline credit valid for 12 months. Applied at checkout.",
    hoursAhead: 240,
    partySize: 1,
    face: 78000,
    price: 55000,
  },
  {
    seller: 5,
    title: "Rooftop tasting + vineyard tour",
    venue: "Halsted Wine Co.",
    category: "dining",
    city: "Chicago",
    description: "Four seats for the reserve tasting with the winemaker.",
    hoursAhead: 26,
    partySize: 4,
    face: 38000,
    price: 22000,
  },
  {
    seller: 1,
    title: "Hot-desk membership, remainder of month",
    venue: "Loop Collective",
    category: "workspace",
    city: "Austin",
    description: "24/7 access, meeting room credits included. My contract ended early.",
    hoursAhead: 72,
    partySize: 1,
    face: 29000,
    price: 14000,
  },
  {
    seller: 6,
    title: "Ski rental package, 2 days",
    venue: "Peak Outfitters",
    category: "sport",
    city: "Denver",
    description: "Premium skis, boots, poles and helmet. Pickup any morning this week.",
    hoursAhead: 58,
    partySize: 2,
    face: 18000,
    price: 9500,
  },
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

export async function seedDatabase(): Promise<void> {
  const passwordHash = hashPassword("standby123");

  const insertedSellers = await db
    .insert(users)
    .values(
      SELLERS.map((s) => ({
        name: s.name,
        email: s.email,
        city: s.city,
        passwordHash,
        balanceCents: 0,
        isDemo: true,
        emailVerifiedAt: new Date(),
      })),
    )
    .returning({ id: users.id });

  const [buyer] = await db
    .insert(users)
    .values({
      name: "Sam Rivera",
      email: "demo@standby.club",
      city: "San Francisco",
      passwordHash,
      balanceCents: 48000,
      isDemo: true,
      emailVerifiedAt: new Date(),
    })
    .returning({ id: users.id });

  const now = Date.now();
  const hour = 3600 * 1000;

  // ---- Live listings ------------------------------------------------
  await db.insert(listings).values(
    LIVE_LISTINGS.map((l, i) => ({
      sellerId: insertedSellers[l.seller].id,
      title: l.title,
      venue: l.venue,
      category: l.category,
      city: l.city,
      description: l.description,
      startsAt: new Date(now + l.hoursAhead * hour),
      partySize: l.partySize,
      faceValueCents: l.face,
      priceCents: l.price,
      transferCode: `SB${(1000 + i * 37).toString(36).toUpperCase()}`,
      status: "live",
      views: 12 + ((i * 29) % 180),
      boostedUntil: i % 5 === 0 ? new Date(now + 18 * hour) : null,
      createdAt: new Date(now - (2 + (i % 9)) * hour),
    })),
  );

  // ---- Historical completed transfers (drives the revenue engine) ---
  const histTitles = [
    ["Ocean-view suite, 1 night", "stay", "Marisol Hotel"],
    ["Front-row comedy tickets", "events", "The Byline"],
    ["Sushi omakase for two", "dining", "Kaito"],
    ["Deep-tissue massage block", "wellness", "Riverbend Spa"],
    ["Tee time for two", "sport", "Fairway Club"],
    ["Sourdough baking workshop", "learning", "Hearth Kitchen"],
    ["Weekend campervan rental", "travel", "Roam Vans"],
    ["Meeting room, full day", "workspace", "Node Collective"],
    ["Rooftop cinema screening", "events", "Skyline Rooftop"],
    ["Wine flight + charcuterie", "dining", "Vine & Rind"],
  ];

  const cities = ["San Francisco", "Austin", "New York", "Miami", "Seattle", "Chicago", "Denver", "Boston"];
  let counter = 0;
  for (let daysAgo = 44; daysAgo >= 0; daysAgo--) {
    // volume grows over time — a young marketplace ramping up
    const ramp = Math.round(1 + (44 - daysAgo) / 9);
    const count = Math.min(5, ramp) + (daysAgo % 3 === 0 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      counter += 1;
      const meta = pick(histTitles, counter);
      const seller = pick(insertedSellers, counter + 1);
      const face = 9000 + ((counter * 7100) % 130000);
      const price = Math.round(face * (0.45 + ((counter % 5) * 0.07)));
      const completedAt = new Date(now - daysAgo * 24 * hour + (k * 3 + 1) * hour);
      const fee = platformFeeCents(price);
      const net = sellerNetCents(price);

      const [row] = await db
        .insert(listings)
        .values({
          sellerId: seller.id,
          buyerId: buyer.id,
          title: meta[0],
          venue: meta[2],
          category: meta[1],
          city: pick(cities, counter),
          description: "Completed transfer — escrow released automatically.",
          startsAt: new Date(completedAt.getTime() + 12 * hour),
          partySize: 1 + (counter % 4),
          faceValueCents: face,
          priceCents: price,
          transferCode: `SB${(5000 + counter).toString(36).toUpperCase()}`,
          status: "completed",
          views: 20 + ((counter * 17) % 220),
          createdAt: new Date(completedAt.getTime() - 30 * hour),
          claimedAt: new Date(completedAt.getTime() - 20 * hour),
          completedAt,
        })
        .returning({ id: listings.id });

      await db.insert(transactions).values({
        listingId: row.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        kind: "sale",
        grossCents: price,
        feeCents: fee,
        netCents: net,
        note: "Escrow released — transfer confirmed",
        createdAt: completedAt,
      });

      if (counter % 7 === 0) {
        await db.insert(transactions).values({
          listingId: row.id,
          sellerId: seller.id,
          kind: "boost",
          grossCents: 199,
          feeCents: 199,
          netCents: 0,
          note: "Priority placement boost (24h)",
          createdAt: new Date(completedAt.getTime() - 28 * hour),
        });
      }
    }
  }

  // Sellers keep the cash they recovered
  await db
    .update(users)
    .set({
      balanceCents: sql`${users.balanceCents} + ${74000}`,
      lifetimeRecoveredCents: sql`${users.lifetimeRecoveredCents} + ${74000}`,
    })
    .where(sql`${users.isDemo} = true`);
}

export async function ensureSeeded(): Promise<void> {
  try {
    const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    if (Number(row?.c ?? 0) > 0) return;
    await db.execute(sql`select pg_advisory_lock(918273)`);
    const [again] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    if (Number(again?.c ?? 0) === 0) {
      await seedDatabase();
    }
    await db.execute(sql`select pg_advisory_unlock(918273)`);
  } catch (err) {
    console.error("seed skipped:", err);
  }
}
