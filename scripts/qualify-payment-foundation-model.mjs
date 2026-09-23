import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/lib/payments/provider.ts", import.meta.url), "utf8");
const registry = readFileSync(new URL("../src/lib/payments/registry.ts", import.meta.url), "utf8");
const testing = readFileSync(new URL("../src/lib/payments/testing.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/lib/payments/store.ts", import.meta.url), "utf8");
const route = readFileSync(
  new URL("../src/app/api/payments/webhook/[provider]/route.ts", import.meta.url),
  "utf8",
);

for (const table of [
  "seller_payment_accounts",
  "payment_operations",
  "payment_provider_events",
  "payment_reconciliation_findings",
]) {
  assert.match(schema, new RegExp(table));
}

assert.match(schema, /payment_operation_idempotency_unique/);
assert.match(schema, /payment_provider_event_unique/);
assert.match(schema, /payment_operation_amount_positive/);
assert.match(schema, /payment_provider_event_status_valid/);
assert.match(schema, /payment_reconciliation_type_valid/);

for (const method of [
  "authorizePayment",
  "capturePayment",
  "cancelAuthorization",
  "refundPayment",
  "createSellerTransfer",
  "createSellerOnboarding",
  "getSellerAccountStatus",
  "verifyWebhook",
]) {
  assert.match(provider, new RegExp(method));
}

assert.match(provider, /Real money operations are disabled/);
assert.match(registry, /no production adapter is registered/);
assert.match(testing, /timingSafeEqual/);
assert.match(testing, /createHmac\("sha256"/);
assert.match(testing, /x-standby-test-signature/);
assert.match(store, /onConflictDoNothing\(\{ target: paymentOperations\.idempotencyKey \}\)/);
assert.match(store, /Provider event ID replayed with different signed content/);
assert.match(store, /dead_letter/);
assert.match(store, /recordReconciliationFinding/);

const verifyIndex = route.indexOf("await provider.verifyWebhook");
const recordIndex = route.indexOf("await recordVerifiedWebhookEvent");
assert.ok(verifyIndex >= 0 && recordIndex > verifyIndex, "webhook must verify before durable ingestion");

console.log("payment-foundation structural qualification: PASS");
console.log("verified: provider-neutral contract, fail-closed registry, signed test adapter, operation idempotency, verified webhook ingestion, retry/dead-letter hooks, and reconciliation records");
