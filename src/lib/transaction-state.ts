export const TRANSACTION_STATES = [
  "created",
  "payment_authorized",
  "payment_failed",
  "transfer_pending",
  "transfer_submitted",
  "transfer_verified",
  "settlement_pending",
  "settled",
  "disputed",
  "refund_pending",
  "refunded",
  "chargeback",
  "cancelled",
] as const;

export type TransactionState = (typeof TRANSACTION_STATES)[number];

const ALLOWED: Record<TransactionState, readonly TransactionState[]> = {
  created: ["payment_authorized", "payment_failed", "cancelled"],
  payment_authorized: ["transfer_pending", "refund_pending", "cancelled"],
  payment_failed: ["payment_authorized", "cancelled"],
  transfer_pending: ["transfer_submitted", "disputed", "refund_pending", "cancelled"],
  transfer_submitted: ["transfer_verified", "disputed", "refund_pending"],
  transfer_verified: ["settlement_pending", "disputed"],
  settlement_pending: ["settled", "disputed", "refund_pending"],
  settled: ["disputed", "chargeback"],
  disputed: ["transfer_verified", "refund_pending", "settlement_pending", "chargeback"],
  refund_pending: ["refunded", "disputed"],
  refunded: ["chargeback"],
  chargeback: [],
  cancelled: [],
};

export function canTransition(from: TransactionState, to: TransactionState): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: TransactionState, to: TransactionState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transaction transition: ${from} -> ${to}`);
  }
}
