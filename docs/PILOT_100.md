# Standby — First 100 Verified Transfers

## Purpose

The first 100 transfers are an evidence program, not a growth campaign.

## Entry criteria

Production pilot begins only after all P0 gates in `PRODUCTION_READINESS.md` are satisfied and the selected category/provider cohort has documented transfer rules.

## Per-transaction record

Capture:

- acquisition source;
- category/provider;
- face value;
- sale price;
- payment processing cost;
- Standby fee;
- seller net;
- seller recovery percentage;
- buyer savings percentage;
- listing-to-claim time;
- claim-to-transfer time;
- verification method;
- operator minutes;
- dispute/refund outcome;
- fraud/risk flags;
- contribution margin.

## Review cadence

Review every transaction for the first 20. For transfers 21–100, manually review every exception plus a random quality sample of successful transactions.

## Stop conditions

Pause new live transactions if any of the following occurs until understood:

- duplicated charge/refund/payout;
- settlement without required transfer evidence;
- material authorization bypass;
- unbounded fraud vector;
- provider policy shows the selected inventory is prohibited;
- reconciliation cannot explain provider vs Standby balances.

## Success evidence

At transaction 100, freeze a report containing:

- verified transfer success rate;
- sell-through rate;
- median time-to-sale and time-to-transfer;
- dispute and refund rates;
- fraud loss / GMV;
- average order value;
- effective take rate;
- seller recovery;
- buyer savings;
- CAC by channel;
- operator minutes / transfer;
- contribution margin / transfer;
- failure taxonomy distribution.

No predetermined numeric threshold is claimed here; thresholds should be set before the pilot using payment economics, legal/risk constraints, and the chosen category.
