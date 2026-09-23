# Standby

Standby is a Next.js marketplace prototype for transferring prepaid reservations and other time-bound bookings. Sellers list bookings they can no longer use, buyers claim them at a discount, and Standby models escrow, settlement, platform fees, boosts, refunds, wallet balances, and payouts using simulated money.

## Stack

- Next.js 16 / React 19 / TypeScript
- PostgreSQL
- Drizzle ORM
- Tailwind CSS 4

## Local setup

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
2. Install dependencies with `npm install`.
3. Create/update the database schema with `npm run db:push`.
4. Start the app with `npm run dev`.

The app seeds demo data automatically when the database is empty. Demo login: `demo@standby.club` / `standby123`.

## Correctness model

The ledger deliberately distinguishes lifecycle events:

- `escrow_hold` — buyer funds leave the available wallet when a listing is claimed; no platform revenue is recognized yet.
- `sale` — emitted once when escrow is released; this is the only event counted as GMV.
- `boost` — seller-paid placement revenue.
- `refund` — held funds returned to the buyer after a seller cancellation.
- `payout` — seller wallet withdrawal.
- `signup_bonus` — simulated demo credit.

Listing transitions use conditional database updates inside transactions so two buyers cannot both successfully claim the same live listing, and settlement/cancellation cannot both win the same state transition.

## Scheduled maintenance

`GET /api/maintenance` runs expiry and escrow auto-release. `vercel.json` schedules it every 15 minutes. In production the endpoint requires `Authorization: Bearer $CRON_SECRET`; configure `CRON_SECRET` in the deployment environment.

Request paths may still invoke the idempotent maintenance routine as a best-effort fallback, but the scheduled job means settlement no longer depends on somebody visiting the site.

## Safety boundary

This repository is a marketplace prototype using simulated money. It is **not** wired to real payment rails and should not be used for live financial custody without a production-grade payments provider, webhook verification, fraud controls, transfer-policy enforcement, dispute handling, audit controls, and a dedicated security review.

## Checks

```bash
npm run typecheck
npm run lint
npm run check
```
