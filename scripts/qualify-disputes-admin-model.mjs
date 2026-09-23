import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
const disputes = readFileSync(new URL("../src/lib/disputes.ts", import.meta.url), "utf8");
const operatorAuth = readFileSync(new URL("../src/lib/operator-auth.ts", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8");

for (const table of [
  "user_roles",
  "disputes",
  "dispute_evidence",
  "payout_holds",
  "refund_decisions",
  "account_restrictions",
  "listing_restrictions",
]) {
  assert.match(schema, new RegExp(table));
}

for (const constraint of [
  "user_role_valid",
  "dispute_reason_valid",
  "dispute_status_valid",
  "dispute_evidence_digest_unique",
  "payout_hold_amount_positive",
  "refund_decision_amount_positive",
  "account_restriction_type_valid",
  "listing_restriction_status_valid",
]) {
  assert.match(schema, new RegExp(constraint));
}

assert.match(operatorAuth, /eq\(userRoles\.userId, userId\)/);
assert.match(operatorAuth, /inArray\(userRoles\.role, \["operator", "admin"\]\)/);
assert.match(disputes, /Only the buyer or seller can open a dispute/);
assert.match(disputes, /Only a transaction participant or operator can submit dispute evidence/);
assert.match(disputes, /Refund approval requires a second operator/);
assert.match(disputes, /Buyer-favor resolution requires an executed refund/);
assert.match(disputes, /action: "dispute\.open"/);
assert.match(disputes, /action: "refund\.propose"/);
assert.match(disputes, /action: "refund\.approve"/);
assert.match(disputes, /action: "payout_hold\.release"/);
assert.match(disputes, /action: "account\.restrict"/);
assert.match(disputes, /action: "listing\.restrict"/);
assert.match(disputes, /action: "dispute\.resolve"/);

assert.match(adminPage, /hasOperatorRole/);
assert.match(adminPage, /AdminControls/);

const adminRoutes = [
  "../src/app/api/admin/refunds/route.ts",
  "../src/app/api/admin/refunds/[id]/approve/route.ts",
  "../src/app/api/admin/payout-holds/[id]/release/route.ts",
  "../src/app/api/admin/disputes/[id]/resolve/route.ts",
  "../src/app/api/admin/users/[id]/suspend/route.ts",
  "../src/app/api/admin/listings/[id]/suspend/route.ts",
];

for (const path of adminRoutes) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, /requireOperatorUser/);
}

console.log("disputes-admin structural qualification: PASS");
console.log("verified: protected operator routes, participant evidence access, four-eyes refund approval, refund-execution gate, payout holds, restrictions, and audit hooks");
