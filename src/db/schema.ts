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
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    sessionVersion: integer("session_version").notNull().default(0),
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    sessionVersion: integer("session_version").notNull().default(0),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auth_token_digest_unique").on(t.tokenDigest),
    index("auth_token_user_purpose_idx").on(t.userId, t.purpose),
    check("auth_token_purpose_valid", sql`${t.purpose} in ('email_verification', 'password_reset')`),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: serial("id").primaryKey(),
    bucketKey: text("bucket_key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("rate_limit_bucket_unique").on(t.bucketKey, t.windowStart),
    index("rate_limit_expiry_idx").on(t.expiresAt),
    check("rate_limit_count_nonnegative", sql`${t.count} >= 0`),
  ],
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

export const sellerPaymentAccounts = pgTable(
  "seller_payment_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerAccountReference: text("provider_account_reference").notNull(),
    onboardingStatus: text("onboarding_status").notNull().default("pending"),
    payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
    country: text("country").notNull().default(""),
    currency: text("currency").notNull().default("USD"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("seller_payment_account_user_provider_unique").on(t.userId, t.provider),
    uniqueIndex("seller_payment_account_provider_ref_unique").on(
      t.provider,
      t.providerAccountReference,
    ),
    check(
      "seller_payment_account_status_valid",
      sql`${t.onboardingStatus} in ('pending', 'restricted', 'enabled', 'disabled')`,
    ),
  ],
);

export const paymentOperations = pgTable(
  "payment_operations",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    operation: text("operation").notNull(),
    state: text("state").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerReference: text("provider_reference"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    metadataJson: text("metadata_json").notNull().default("{}"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_operation_idempotency_unique").on(t.idempotencyKey),
    index("payment_operation_tx_idx").on(t.marketplaceTransactionId),
    index("payment_operation_provider_ref_idx").on(t.provider, t.providerReference),
    check("payment_operation_amount_positive", sql`${t.amountCents} > 0`),
    check(
      "payment_operation_type_valid",
      sql`${t.operation} in (
        'authorize',
        'capture',
        'cancel_authorization',
        'refund',
        'seller_transfer'
      )`,
    ),
    check(
      "payment_operation_state_valid",
      sql`${t.state} in ('pending', 'succeeded', 'failed')`,
    ),
  ],
);

export const paymentProviderEvents = pgTable(
  "payment_provider_events",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    signatureDigest: text("signature_digest").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    normalizedPayloadJson: text("normalized_payload_json").notNull().default("{}"),
    status: text("status").notNull().default("received"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    correlationId: text("correlation_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payment_provider_event_unique").on(t.provider, t.providerEventId),
    index("payment_provider_event_status_idx").on(t.status, t.nextAttemptAt),
    index("payment_provider_event_correlation_idx").on(t.correlationId),
    check("payment_provider_event_attempts_nonnegative", sql`${t.attempts} >= 0`),
    check(
      "payment_provider_event_status_valid",
      sql`${t.status} in ('received', 'processing', 'processed', 'failed', 'dead_letter')`,
    ),
  ],
);

export const paymentReconciliationFindings = pgTable(
  "payment_reconciliation_findings",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    marketplaceTransactionId: integer("marketplace_transaction_id").references(
      () => marketplaceTransactions.id,
      { onDelete: "restrict" },
    ),
    externalReference: text("external_reference").notNull(),
    findingType: text("finding_type").notNull(),
    status: text("status").notNull().default("open"),
    expectedJson: text("expected_json").notNull().default("{}"),
    observedJson: text("observed_json").notNull().default("{}"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("payment_reconciliation_status_idx").on(t.status),
    index("payment_reconciliation_external_idx").on(t.provider, t.externalReference),
    check(
      "payment_reconciliation_type_valid",
      sql`${t.findingType} in (
        'missing_local',
        'missing_provider',
        'amount_mismatch',
        'state_mismatch',
        'duplicate',
        'other'
      )`,
    ),
    check(
      "payment_reconciliation_status_valid",
      sql`${t.status} in ('open', 'resolved', 'ignored')`,
    ),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    grantedByUserId: integer("granted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_role_unique").on(t.userId, t.role),
    check("user_role_valid", sql`${t.role} in ('operator', 'admin')`),
  ],
);

export const disputes = pgTable(
  "disputes",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id, { onDelete: "restrict" }),
    openedByUserId: integer("opened_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reasonCode: text("reason_code").notNull(),
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("dispute_transaction_unique").on(t.marketplaceTransactionId),
    index("dispute_status_idx").on(t.status),
    check(
      "dispute_reason_valid",
      sql`${t.reasonCode} in (
        'transfer_denied',
        'provider_policy',
        'invalid_booking',
        'duplicate_listing',
        'seller_cancelled',
        'upstream_cancellation',
        'buyer_dispute',
        'other'
      )`,
    ),
    check(
      "dispute_status_valid",
      sql`${t.status} in (
        'open',
        'evidence_requested',
        'under_review',
        'resolved_buyer',
        'resolved_seller',
        'cancelled'
      )`,
    ),
  ],
);

export const disputeEvidence = pgTable(
  "dispute_evidence",
  {
    id: serial("id").primaryKey(),
    disputeId: integer("dispute_id")
      .notNull()
      .references(() => disputes.id, { onDelete: "restrict" }),
    submittedByUserId: integer("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    evidenceType: text("evidence_type").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dispute_evidence_digest_unique").on(t.disputeId, t.payloadDigest),
    index("dispute_evidence_dispute_idx").on(t.disputeId),
    check(
      "dispute_evidence_type_valid",
      sql`${t.evidenceType} in (
        'buyer_statement',
        'seller_statement',
        'provider_response',
        'attachment_digest',
        'operator_note'
      )`,
    ),
  ],
);

export const payoutHolds = pgTable(
  "payout_holds",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id, { onDelete: "restrict" }),
    sellerId: integer("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("active"),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    releasedByUserId: integer("released_by_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("payout_hold_transaction_unique").on(t.marketplaceTransactionId),
    index("payout_hold_status_idx").on(t.status),
    check("payout_hold_amount_positive", sql`${t.amountCents} > 0`),
    check("payout_hold_status_valid", sql`${t.status} in ('active', 'released')`),
  ],
);

export const refundDecisions = pgTable(
  "refund_decisions",
  {
    id: serial("id").primaryKey(),
    marketplaceTransactionId: integer("marketplace_transaction_id")
      .notNull()
      .references(() => marketplaceTransactions.id, { onDelete: "restrict" }),
    disputeId: integer("dispute_id").references(() => disputes.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    reasonCode: text("reason_code").notNull(),
    status: text("status").notNull().default("proposed"),
    proposedByUserId: integer("proposed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedByUserId: integer("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    paymentOperationId: integer("payment_operation_id").references(() => paymentOperations.id, { onDelete: "restrict" }),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("refund_decision_transaction_unique").on(t.marketplaceTransactionId),
    index("refund_decision_status_idx").on(t.status),
    check("refund_decision_amount_positive", sql`${t.amountCents} > 0`),
    check(
      "refund_decision_status_valid",
      sql`${t.status} in ('proposed', 'approved', 'executed', 'rejected')`,
    ),
  ],
);

export const accountRestrictions = pgTable(
  "account_restrictions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    restrictionType: text("restriction_type").notNull(),
    status: text("status").notNull().default("active"),
    reason: text("reason").notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    liftedByUserId: integer("lifted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("account_restriction_unique").on(t.userId, t.restrictionType),
    check(
      "account_restriction_type_valid",
      sql`${t.restrictionType} in ('marketplace_suspension', 'payout_suspension')`,
    ),
    check("account_restriction_status_valid", sql`${t.status} in ('active', 'lifted')`),
  ],
);

export const listingRestrictions = pgTable(
  "listing_restrictions",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("active"),
    reason: text("reason").notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    liftedByUserId: integer("lifted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    liftedAt: timestamp("lifted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("listing_restriction_unique").on(t.listingId),
    check("listing_restriction_status_valid", sql`${t.status} in ('active', 'lifted')`),
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
export type AuthToken = typeof authTokens.$inferSelect;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
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
export type SellerPaymentAccount = typeof sellerPaymentAccounts.$inferSelect;
export type PaymentOperation = typeof paymentOperations.$inferSelect;
export type PaymentProviderEvent = typeof paymentProviderEvents.$inferSelect;
export type PaymentReconciliationFinding = typeof paymentReconciliationFindings.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type DisputeEvidence = typeof disputeEvidence.$inferSelect;
export type PayoutHold = typeof payoutHolds.$inferSelect;
export type RefundDecision = typeof refundDecisions.$inferSelect;
export type AccountRestriction = typeof accountRestrictions.$inferSelect;
export type ListingRestriction = typeof listingRestrictions.$inferSelect;
