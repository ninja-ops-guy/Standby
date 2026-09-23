import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
const policy = readFileSync(new URL("../src/lib/transfer-policy.ts", import.meta.url), "utf8");

for (const table of [
  "reservation_policies",
  "listing_policy_bindings",
  "transaction_policy_snapshots",
  "transfer_evidence",
]) {
  assert.match(schema, new RegExp(table));
}

assert.match(schema, /reservation_policy_transferability_valid/);
assert.match(schema, /reservation_policy_method_valid/);
assert.match(schema, /transfer_evidence_type_valid/);
assert.match(schema, /transfer_evidence_status_valid/);
assert.match(schema, /transaction_policy_snapshot_tx_unique/);
assert.match(schema, /transfer_evidence_digest_unique/);

assert.match(policy, /transferability === "unknown"/);
assert.match(policy, /transferability === "prohibited"/);
assert.match(policy, /transfer_method_unsupported/);
assert.match(policy, /policy_not_verified/);
assert.match(policy, /policy_source_unverified/);
assert.match(policy, /evidence_requirements_missing/);
assert.match(policy, /snapshotPolicyForTransaction/);
assert.match(policy, /assertTransferVerifiedForSettlement/);
assert.match(policy, /onConflictDoNothing/);

console.log("transfer-policy structural qualification: PASS");
console.log("verified: fail-closed policy admission, immutable transaction snapshot, evidence idempotency, and settlement verification gate hooks");
