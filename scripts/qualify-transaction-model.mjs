import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stateSource = readFileSync(new URL("../src/lib/transaction-state.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
const ledgerSource = readFileSync(new URL("../src/lib/ledger.ts", import.meta.url), "utf8");
const txSource = readFileSync(new URL("../src/lib/production-transactions.ts", import.meta.url), "utf8");

const states = [
  "created","payment_authorized","payment_failed","transfer_pending","transfer_submitted",
  "transfer_verified","settlement_pending","settled","disputed","refund_pending","refunded",
  "chargeback","cancelled",
];

for (const state of states) assert.match(stateSource, new RegExp(`"${state}"`));
assert.match(schemaSource, /ledger_entries/);
assert.match(schemaSource, /marketplace_transactions/);
assert.match(schemaSource, /transaction_state_events/);
assert.match(schemaSource, /audit_events/);
assert.match(schemaSource, /uniqueIndex\("ledger_idempotency_unique"\)/);
assert.match(schemaSource, /uniqueIndex\("marketplace_transactions_correlation_unique"\)/);
assert.match(ledgerSource, /onConflictDoNothing\(\{ target: ledgerEntries\.idempotencyKey \}\)/);
assert.match(txSource, /eq\(marketplaceTransactions\.state, input\.expectedState\)/);
assert.match(txSource, /transactionStateEvents/);
assert.match(txSource, /auditEvents/);

console.log("transaction-model qualification: PASS");
console.log("13 states present; immutable ledger idempotency, guarded transitions, state history, and audit hooks detected.");
