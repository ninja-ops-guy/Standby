import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    city: text("city").notNull().default(""),
    balanceCents: integer("balance_cents").notNull().default(0),
    lifetimeSavedCents: integer("lifetime_saved_cents").notNull().default(0),
    lifetimeRecoveredCents: integer("lifetime_recovered_cents").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    sellerId: integer("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    buyerId: integer("buyer_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    venue: text("venue").notNull(),
    category: text("category").notNull(),
    city: text("city").notNull(),
    description: text("description").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    partySize: integer("party_size").notNull().default(1),
    faceValueCents: integer("face_value_cents").notNull(),
    priceCents: integer("price_cents").notNull(),
    transferCode: text("transfer_code").notNull(),
    status: text("status").notNull().default("live"), // live | claimed | completed | expired | cancelled
    boostedUntil: timestamp("boosted_until", { withTimezone: true }),
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("listings_status_idx").on(t.status),
    index("listings_category_idx").on(t.category),
    index("listings_seller_idx").on(t.sellerId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id").references(() => listings.id, { onDelete: "set null" }),
    buyerId: integer("buyer_id").references(() => users.id, { onDelete: "set null" }),
    sellerId: integer("seller_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // escrow_hold | sale | boost | refund | payout | signup_bonus
    grossCents: integer("gross_cents").notNull().default(0),
    feeCents: integer("fee_cents").notNull().default(0),
    netCents: integer("net_cents").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_kind_idx").on(t.kind),
    index("transactions_listing_kind_idx").on(t.listingId, t.kind),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("paid"), // pending | paid
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("payouts_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
