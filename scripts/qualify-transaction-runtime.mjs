import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString });
await client.connect();

async function scalar(text, params = []) {
  const result = await client.query(text, params);
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
}

try {
  const requiredTables = [
    "marketplace_transactions",
    "transaction_state_events",
    "ledger_entries",
    "audit_events",
  ];

  for (const table of requiredTables) {
    const exists = await scalar(
      "select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1)",
      [table],
    );
    assert.equal(exists, true, `missing table: ${table}`);
  }

  await client.query("begin");

  const suffix = Date.now().toString(36);
  const seller = await client.query(
    `insert into users(email,name,password_hash,city,balance_cents,is_demo)
     values($1,'Qual Seller','x','Test City',0,true) returning id`,
    [`qual-seller-${suffix}@example.test`],
  );
  const buyer = await client.query(
    `insert into users(email,name,password_hash,city,balance_cents,is_demo)
     values($1,'Qual Buyer','x','Test City',0,true) returning id`,
    [`qual-buyer-${suffix}@example.test`],
  );

  const listing = await client.query(
    `insert into listings(
      seller_id,title,venue,category,city,description,starts_at,party_size,
      face_value_cents,price_cents,transfer_code,status
    ) values($1,'Qualification listing','Qualification Venue','stay','Test City','',
      now() + interval '1 day',2,20000,12000,'QUAL01','live') returning id`,
    [seller.rows[0].id],
  );

  const correlation = `qual-correlation-${suffix}`;
  const tx = await client.query(
    `insert into marketplace_transactions(
      listing_id,buyer_id,seller_id,amount_cents,currency,state,correlation_id
    ) values($1,$2,$3,12000,'USD','created',$4) returning id,state`,
    [listing.rows[0].id, buyer.rows[0].id, seller.rows[0].id, correlation],
  );
  const txId = tx.rows[0].id;
  assert.equal(tx.rows[0].state, "created");

  await client.query("savepoint duplicate_correlation");
  let duplicateCorrelationRejected = false;
  try {
    await client.query(
      `insert into marketplace_transactions(
        listing_id,buyer_id,seller_id,amount_cents,currency,state,correlation_id
      ) values($1,$2,$3,12000,'USD','created',$4)`,
      [listing.rows[0].id, buyer.rows[0].id, seller.rows[0].id, correlation],
    );
  } catch (error) {
    duplicateCorrelationRejected = error?.code === "23505";
    await client.query("rollback to savepoint duplicate_correlation");
  }
  assert.equal(duplicateCorrelationRejected, true, "duplicate correlation ID was not rejected");

  await client.query("savepoint bad_amount");
  let badAmountRejected = false;
  try {
    await client.query(
      `insert into ledger_entries(
        marketplace_transaction_id,account,direction,amount_cents,currency,reason,
        idempotency_key,correlation_id
      ) values($1,'buyer:available','debit',0,'USD','qualification',
        $2,$3)`,
      [txId, `bad-amount-${suffix}`, correlation],
    );
  } catch (error) {
    badAmountRejected = error?.code === "23514";
    await client.query("rollback to savepoint bad_amount");
  }
  assert.equal(badAmountRejected, true, "non-positive ledger amount was not rejected");

  await client.query("savepoint bad_direction");
  let badDirectionRejected = false;
  try {
    await client.query(
      `insert into ledger_entries(
        marketplace_transaction_id,account,direction,amount_cents,currency,reason,
        idempotency_key,correlation_id
      ) values($1,'buyer:available','sideways',100,'USD','qualification',
        $2,$3)`,
      [txId, `bad-direction-${suffix}`, correlation],
    );
  } catch (error) {
    badDirectionRejected = error?.code === "23514";
    await client.query("rollback to savepoint bad_direction");
  }
  assert.equal(badDirectionRejected, true, "invalid ledger direction was not rejected");

  const idempotencyKey = `ledger-hold-${suffix}`;
  const firstLedger = await client.query(
    `insert into ledger_entries(
      marketplace_transaction_id,listing_id,user_id,account,direction,amount_cents,
      currency,reason,idempotency_key,external_reference,correlation_id
    ) values($1,$2,$3,'buyer:available','debit',12000,'USD','payment_authorized',
      $4,'provider:test:1',$5)
    on conflict (idempotency_key) do nothing
    returning id`,
    [txId, listing.rows[0].id, buyer.rows[0].id, idempotencyKey, correlation],
  );
  assert.equal(firstLedger.rowCount, 1);

  const replayLedger = await client.query(
    `insert into ledger_entries(
      marketplace_transaction_id,listing_id,user_id,account,direction,amount_cents,
      currency,reason,idempotency_key,external_reference,correlation_id
    ) values($1,$2,$3,'buyer:available','debit',12000,'USD','payment_authorized',
      $4,'provider:test:1',$5)
    on conflict (idempotency_key) do nothing
    returning id`,
    [txId, listing.rows[0].id, buyer.rows[0].id, idempotencyKey, correlation],
  );
  assert.equal(replayLedger.rowCount, 0, "idempotency replay created a second economic event");

  const ledgerCount = Number(
    await scalar("select count(*)::int from ledger_entries where idempotency_key=$1", [idempotencyKey]),
  );
  assert.equal(ledgerCount, 1);

  const firstTransition = await client.query(
    `update marketplace_transactions
       set state='payment_authorized', updated_at=now()
     where id=$1 and state='created'
     returning state`,
    [txId],
  );
  assert.equal(firstTransition.rowCount, 1);
  assert.equal(firstTransition.rows[0].state, "payment_authorized");

  const staleTransition = await client.query(
    `update marketplace_transactions
       set state='transfer_pending', updated_at=now()
     where id=$1 and state='created'
     returning state`,
    [txId],
  );
  assert.equal(staleTransition.rowCount, 0, "stale expected-state transition unexpectedly won");

  await client.query(
    `insert into transaction_state_events(
      marketplace_transaction_id,from_state,to_state,reason,actor_user_id,correlation_id
    ) values($1,'created','payment_authorized','qualification',$2,$3)`,
    [txId, buyer.rows[0].id, correlation],
  );
  await client.query(
    `insert into audit_events(
      actor_user_id,action,target_type,target_id,correlation_id,metadata_json
    ) values($1,'marketplace_transaction.transition','marketplace_transaction',$2,$3,'{}')`,
    [buyer.rows[0].id, String(txId), correlation],
  );

  const eventCount = Number(
    await scalar("select count(*)::int from transaction_state_events where marketplace_transaction_id=$1", [txId]),
  );
  const auditCount = Number(
    await scalar("select count(*)::int from audit_events where correlation_id=$1", [correlation]),
  );
  assert.equal(eventCount, 1);
  assert.equal(auditCount, 1);

  await client.query(
    `insert into ledger_entries(
      marketplace_transaction_id,user_id,account,direction,amount_cents,currency,reason,
      idempotency_key,correlation_id
    ) values
      ($1,$2,'escrow:qual','credit',12000,'USD','escrow_hold',$3,$5),
      ($1,$2,'escrow:qual','debit',12000,'USD','escrow_release',$4,$5)`,
    [
      txId,
      buyer.rows[0].id,
      `escrow-credit-${suffix}`,
      `escrow-debit-${suffix}`,
      correlation,
    ],
  );

  const escrowBalance = Number(
    await scalar(
      `select coalesce(sum(case when direction='credit' then amount_cents else -amount_cents end),0)::int
       from ledger_entries where account='escrow:qual' and correlation_id=$1`,
      [correlation],
    ),
  );
  assert.equal(escrowBalance, 0, "balanced escrow test did not reconcile to zero");

  await client.query("rollback");

  console.log("transaction-runtime qualification: PASS");
  console.log("verified: schema presence, amount/direction constraints, unique correlation, ledger idempotency replay, guarded transitions, state history, audit trail, balanced escrow reconciliation");
} finally {
  await client.end();
}
