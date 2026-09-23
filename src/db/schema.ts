import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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

export const marketplaceTransactions = pgTable(
  "marketplace_transactions",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    buyerId: integer("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sellerId: integer("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    state: text("state").notNull().default("created"),
    correlationId: text("correlation_id").notNull(),
    paymentProvider: text("payment_provider"),
    providerPaymentReference: text("provider_payment_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("marketplace_transactions_correlation_unique").on(t.correlationId),
    index("marketplace_transactions_listing_idx").on(t.listingId),
    index("marketplace_transactions_state_idx").on(t.state),
    check("marketplace_transaction_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

export const transactionStateEvents = pgTable(
  "transaction_state_events",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id, { onDelete: "restrict" }),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    reason: text("reason").notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transaction_state_events_tx_idx").on(t.marketplaceTransactionId),
    index("transaction_state_events_correlation_idx").on(t.correlationId),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id").references(
      () => marketplaceTransactions.id,
      { onDelete: "restrict" },
    ),
    listingId: integer("listing_id").references(() => listings.id, { onDelete: "restrict" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "restrict" }),
    account: text("account").notNull(),
    direction: text("direction").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    reason: text("reason").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    externalReference: text("external_reference"),
    correlationId: text("correlation_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_idempotency_unique").on(t.idempotencyKey),
    index("ledger_transaction_idx").on(t.marketplaceTransactionId),
    index("ledger_account_idx").on(t.account),
    index("ledger_correlation_idx").on(t.correlationId),
    check("ledger_amount_positive", sql`${t.amountCents} > 0`),
    check("ledger_direction_valid", sql`${t.direction} in (\'debit\', \'credit\')`),
  ],
);

export const reservationPolicies = pgTable(
  "reservation_policies",
  {
    id: serial("id").primaryKey(),
    providerName: text("provider_name").notNull(),
    bookingType: text("booking_type").notNull(),
    jurisdiction: text("jurisdiction").notNull().default(""),
    transferability: text("transferability").notNull().default("unknown"),
    transferMethod: text("transfer_method").notNull().default("unknown"),
    transferFeeCents: integer("transfer_fee_cents"),
    deadlineRule: text("deadline_rule").notNull().default(""),
    evidenceRequirementsJson: text("evidence_requirements_json").notNull().default("[]"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type").notNull().default("unverified"),
    policyVersion: text("policy_version").notNull().default("r0"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reservation_policy_version_unique").on(
      t.providerName,
      t.bookingType,
      t.jurisdiction,
      t.policyVersion,
    ),
    index("reservation_policy_provider_idx").on(t.providerName),
    check(
      "reservation_policy_transferability_valid",
      sql`${t.transferability} in ('allowed', 'conditional', 'prohibited', 'unknown')`,
    ),
    check(
      "reservation_policy_method_valid",
      sql`${t.transferMethod} in (
        'official_digital_transfer',
        'provider_name_change',
        'voucher_credit',
        'confirmation_code',
        'unsupported',
        'unknown'
      )`,
    ),
    check(
      "reservation_policy_fee_nonnegative",
      sql`${t.transferFeeCents} is null or ${t.transferFeeCents} >= 0`,
    ),
  ],
);

export const listingPolicyBindings = pgTable(
  "listing_policy_bindings",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    reservationPolicyId: integer("reservation_policy_id")
      .notNull()
      .references(() => reservationPolicies.id, { onDelete: "restrict" }),
    boundByUserId: integer("bound_by_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: text("correlation_id").notNull(),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("listing_policy_binding_listing_unique").on(t.listingId),
    index("listing_policy_binding_policy_idx").on(t.reservationPolicyId),
  ],
);

export const transactionPolicySnapshots = pgTable(
  "transaction_policy_snapshots",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id, { onDelete: "restrict" }),
    reservationPolicyId: integer("reservation_policy_id")
      .notNull()
      .references(() => reservationPolicies.id, { onDelete: "restrict" }),
    providerName: text("provider_name").notNull(),
    bookingType: text("booking_type").notNull(),
    jurisdiction: text("jurisdiction").notNull().default(""),
    transferability: text("transferability").notNull(),
    transferMethod: text("transfer_method").notNull(),
    transferFeeCents: integer("transfer_fee_cents"),
    deadlineRule: text("deadline_rule").notNull().default(""),
    evidenceRequirementsJson: text("evidence_requirements_json").notNull(),
    sourceUrl: text("source_url"),
    sourceType: text("source_type").notNull(),
    policyVersion: text("policy_version").notNull(),
    policyVerifiedAt: timestamp("policy_verified_at", { withTimezone: true }).notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transaction_policy_snapshot_tx_unique").on(t.marketplaceTransactionId),
    index("transaction_policy_snapshot_policy_idx").on(t.reservationPolicyId),
  ],
);

export const transferEvidence = pgTable(
  "transfer_evidence",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id, { onDelete: "restrict" }),
    evidenceType: text("evidence_type").notNull(),
    source: text("source").notNull(),
    externalReference: text("external_reference"),
    payloadDigest: text("payload_digest").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    verificationStatus: text("verification_status").notNull().default("pending"),
    verifiedByUserId: integer("verified_by_user_id").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transfer_evidence_digest_unique").on(t.marketplaceTransactionId, t.payloadDigest),
    index("transfer_evidence_tx_idx").on(t.marketplaceTransactionId),
    check(
      "transfer_evidence_type_valid",
      sql`${t.evidenceType} in (
        'provider_receipt',
        'buyer_acknowledgement',
        'seller_submission',
        'operator_verification',
        'provider_response',
        'other'
      )`,
    ),
    check(
      "transfer_evidence_status_valid",
      sql`${t.verificationStatus} in ('pending', 'verified', 'rejected')`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_target_idx").on(t.targetType, t.targetId),
    index("audit_events_correlation_idx").on(t.correlationId),
  ],
);

export type User = typeof users.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type MarketplaceTransaction = typeof marketplaceTransactions.$inferSelect;
export type TransactionStateEvent = typeof transactionStateEvents.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type ReservationPolicy = typeof reservationPolicies.$inferSelect;
export type ListingPolicyBinding = typeof listingPolicyBindings.$inferSelect;
export type TransactionPolicySnapshot = typeof transactionPolicySnapshots.$inferSelect;
export type TransferEvidence = typeof transferEvidence.$inferSelect;
