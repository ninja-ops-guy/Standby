# Standby Production Readiness R0

Status: **PRE-PRODUCTION / REAL MONEY NOT AUTHORIZED**

## Objective

Reach **Production Transaction #1** safely, then prove the same transaction lifecycle can be repeated 100 times with measured transfer success, dispute rate, fraud loss, time-to-transfer, seller recovery, buyer savings, and contribution margin.

A production transaction is not complete merely because payment succeeded. Qualification requires:

1. the seller is eligible to list;
2. the reservation exists and its transfer policy is known;
3. the buyer payment is authorized by a marketplace-capable payment provider;
4. the reservation transfer is independently evidenced;
5. settlement/refund follows the verified outcome;
6. every privileged and financial transition is auditable;
7. retries cannot duplicate charges, refunds, settlement, or payouts.

## Current boundary

The current repository is a strong marketplace prototype with simulated money. Its wallet/escrow values are application data, not regulated financial custody. Do not connect real customer funds to the existing simulated wallet.

## P0 — blocks any real-money pilot

### P0-01 Payments abstraction
Create a provider-neutral payment interface covering customer authorization, seller onboarding, connected payout destination, capture/settlement, refund, webhook ingestion, and reconciliation. The application database records provider truth; it does not pretend to be the payment processor.

### P0-02 Immutable financial ledger
Replace mutable balance-as-authority with append-only ledger entries and derived balances. Every entry needs a stable external/provider reference, transaction correlation ID, currency, amount, direction, reason, timestamp, and idempotency key.

Required invariant:

> A retry may reproduce the same result, but may never create a second economic event.

### P0-03 Transfer policy and verification
Add provider/reservation policy records and evidence-backed verification. Minimum transfer methods:

- official digital transfer
- provider-assisted name change
- transferable voucher/credit
- confirmation-code handoff where explicitly permitted
- unsupported / non-transferable

No listing may enter the real-money path unless policy state is known.

### P0-04 Transaction state machine
Separate listing state from financial/transfer state.

Suggested transaction states:

```
created
payment_authorized
payment_failed
transfer_pending
transfer_submitted
transfer_verified
settlement_pending
settled
disputed
refund_pending
refunded
chargeback
cancelled
```

Every transition must be conditional and auditable.

### P0-05 Webhook + idempotency boundary
All payment-provider webhooks require signature verification, replay protection, durable event IDs, idempotent handlers, and dead-letter/retry handling.

### P0-06 Disputes and refunds
A buyer must have an explicit exception path before seller settlement. Support evidence submission, payout hold, refund decision, reason codes, and operator resolution.

### P0-07 Admin control plane
Operators need a protected interface to:

- inspect complete transaction timelines;
- hold/release seller settlement;
- issue permitted refunds;
- suspend users/listings;
- review verification evidence;
- record dispute decisions;
- inspect webhook/reconciliation failures;
- view every privileged action in the audit log.

### P0-08 Security baseline
Before real users/funds:

- schema validation on every mutation;
- login/signup/financial rate limiting;
- verified email;
- password reset;
- session rotation and revocation;
- CSRF review/protection;
- strict security headers/CSP;
- production secrets management;
- webhook signature verification;
- authorization tests for every mutation;
- structured audit log;
- dependency/security scanning;
- backup/restore test.

### P0-09 Legal/policy gate
Obtain appropriate legal review before real-money launch. Required product documents include marketplace terms, privacy policy, seller representations, prohibited inventory, refund/dispute rules, provider-policy handling, and launch-jurisdiction review.

## P1 — required for private beta

- staging and production isolation;
- managed PostgreSQL migrations;
- point-in-time recovery/backups;
- structured logs and error monitoring;
- uptime/health checks;
- fraud/velocity controls;
- duplicate reservation fingerprinting;
- seller payout delay/hold rules;
- transaction reconciliation job;
- operator runbooks;
- support contact and incident process;
- analytics for funnel and transaction outcomes.

## P2 — scale after the first verified transactions

- provider integrations/API;
- automated reservation verification;
- risk scoring;
- reputation;
- dynamic pricing suggestions;
- provider policy graph;
- referral system;
- professional seller/provider tooling;
- automated exception routing.

## Launch strategy

Do not launch all categories simultaneously. Select one category/provider cohort based on:

- explicit transferability;
- high enough average order value;
- measurable buyer demand;
- low operational ambiguity;
- acceptable dispute/fraud surface.

### Qualification ladder

**Gate A — synthetic:** all state-machine, idempotency, authorization, refund, and webhook replay tests pass.

**Gate B — staging:** real payment-provider sandbox, real webhook delivery, seller onboarding sandbox, refund path, reconciliation, and operator controls pass.

**Gate C — controlled live:** one low-risk authorized transaction with explicit participants and documented transfer policy.

**Gate D — private alpha:** 20–50 participants, every transaction manually reviewed.

**Gate E — 100-transfer evidence:** publish measured transfer success, sell-through, dispute/refund/fraud loss, time-to-transfer, seller recovery, buyer savings, CAC, and contribution margin.

## North-star metric

**Verified successful transfers per week.**

Supporting metrics:

- GMV
- effective take rate
- verified transfer success rate
- sell-through rate
- median time-to-sale
- median time-to-transfer
- average order value
- seller recovery rate
- buyer savings
- dispute rate
- refund rate
- fraud loss / GMV
- payment failure rate
- repeat buyer/seller rate
- contribution margin / transfer
