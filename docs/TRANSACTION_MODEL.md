# Transaction Model R0

## Design rule

Listing discovery, reservation transfer, and money movement are related but separate state machines. A listing status must never be used as the sole authority for a payment outcome.

## Core records

### ReservationPolicy
Identifies provider, booking type, jurisdiction, transferability, method, deadline, fees, evidence requirements, source, verification time, and policy version.

### TransferEvidence
Append-only evidence for a transaction. Examples: provider transfer receipt, redacted confirmation, buyer acknowledgement, provider response, operator verification.

### PaymentEvent
Append-only record of provider-originated financial events. Includes provider event ID and idempotency key.

### AuditEvent
Append-only record of privileged or security-sensitive actions. Actor, action, target, correlation ID, before/after references, timestamp.

## Economic invariants

1. An escrow/payment authorization is not GMV.
2. A completed transfer creates at most one recognized sale.
3. A refund cannot exceed captured/settled buyer funds.
4. Seller payout cannot exceed available settled seller proceeds.
5. Platform revenue is derived from completed economic events, not UI/listing states.
6. Every provider event is processed at most once economically.
7. Every manual financial action produces an audit event.

## Transfer invariant

> No settlement is released merely because a model, seller, or buyer says “completed.” Settlement requires the configured verification policy for that reservation class.

## Failure taxonomy

- TRANSFER_DENIED
- PROVIDER_POLICY
- INVALID_BOOKING
- DUPLICATE_LISTING
- SELLER_CANCELLED
- BUYER_DISPUTE
- PAYMENT_FAILURE
- PAYMENT_REPLAY
- IDENTITY_FAILURE
- UPSTREAM_CANCELLATION
- WEBHOOK_FAILURE
- RECONCILIATION_MISMATCH
- OTHER
