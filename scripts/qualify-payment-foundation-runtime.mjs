import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function scalar(text, params = []) {
  const result = await client.query(text, params);
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
}

async function expectSqlState(fn, code, label) {
  await client.query(`savepoint ${label}`);
  let rejected = false;
  try {
    await fn();
  } catch (error) {
    rejected = error?.code === code;
    await client.query(`rollback to savepoint ${label}`);
  }
  assert.equal(rejected, true, `${label} did not fail with SQLSTATE ${code}`);
}

try {
  for (const table of [
    "seller_payment_accounts",
    "payment_operations",
    "payment_provider_events",
    "payment_reconciliation_findings",
  ]) {
    const exists = await scalar(
      "select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1)",
      [table],
    );
    assert.equal(exists, true, `missing table: ${table}`);
  }

  await client.query("begin");
  const suffix = Date.now().toString(36);

  const seller = await client.query(
    "insert into users(email,name,password_hash,city,is_demo) values($1,'Pay Seller','x','Test',true) returning id",
    [`pay-seller-${suffix}@example.test`],
  );
  const buyer = await client.query(
    "insert into users(email,name,password_hash,city,is_demo) values($1,'Pay Buyer','x','Test',true) returning id",
    [`pay-buyer-${suffix}@example.test`],
  );
  const listing = await client.query(
    `insert into listings(
      seller_id,title,venue,category,city,description,starts_at,party_size,
      face_value_cents,price_cents,transfer_code,status
    ) values($1,'Payment qualification','Provider','stay','Test','',
      now()+interval '1 day',2,20000,12000,'PAY001','live') returning id`,
    [seller.rows[0].id],
  );
  const tx = await client.query(
    `insert into marketplace_transactions(
      listing_id,buyer_id,seller_id,amount_cents,currency,state,correlation_id
    ) values($1,$2,$3,12000,'USD','created',$4) returning id`,
    [listing.rows[0].id,buyer.rows[0].id,seller.rows[0].id,`pay-tx-${suffix}`],
  );

  const account = await client.query(
    `insert into seller_payment_accounts(
      user_id,provider,provider_account_reference,onboarding_status,payouts_enabled,country,currency
    ) values($1,'test','acct_001','enabled',true,'US','USD') returning id`,
    [seller.rows[0].id],
  );
  assert.equal(account.rowCount, 1);

  await expectSqlState(
    () => client.query(
      `insert into seller_payment_accounts(
        user_id,provider,provider_account_reference,onboarding_status,payouts_enabled
      ) values($1,'test','acct_002','enabled',true)`,
      [seller.rows[0].id],
    ),
    "23505",
    "duplicate_seller_provider",
  );

  await expectSqlState(
    () => client.query(
      `insert into seller_payment_accounts(
        user_id,provider,provider_account_reference,onboarding_status,payouts_enabled
      ) values($1,'other','acct_bad','mystery',false)`,
      [seller.rows[0].id],
    ),
    "23514",
    "bad_onboarding_status",
  );

  const idempotencyKey = `authorize-${suffix}`;
  const op = await client.query(
    `insert into payment_operations(
      marketplace_transaction_id,provider,operation,state,amount_cents,currency,
      idempotency_key,correlation_id
    ) values($1,'test','authorize','pending',12000,'USD',$2,$3)
    returning id`,
    [tx.rows[0].id,idempotencyKey,`op-${suffix}`],
  );
  assert.equal(op.rowCount, 1);

  const replay = await client.query(
    `insert into payment_operations(
      marketplace_transaction_id,provider,operation,state,amount_cents,currency,
      idempotency_key,correlation_id
    ) values($1,'test','authorize','pending',12000,'USD',$2,$3)
    on conflict(idempotency_key) do nothing returning id`,
    [tx.rows[0].id,idempotencyKey,`op-replay-${suffix}`],
  );
  assert.equal(replay.rowCount, 0, "payment operation replay created a duplicate operation");

  await expectSqlState(
    () => client.query(
      `insert into payment_operations(
        marketplace_transaction_id,provider,operation,state,amount_cents,currency,
        idempotency_key,correlation_id
      ) values($1,'test','teleport','pending',12000,'USD',$2,$3)`,
      [tx.rows[0].id,`bad-op-${suffix}`,`bad-op-${suffix}`],
    ),
    "23514",
    "bad_payment_operation",
  );

  const event = await client.query(
    `insert into payment_provider_events(
      provider,provider_event_id,event_type,signature_digest,payload_digest,
      normalized_payload_json,status,attempts,correlation_id
    ) values('test',$1,'payment.authorized',$2,$3,'{}','received',0,$4)
    returning id`,
    [`evt-${suffix}`,"a".repeat(64),"b".repeat(64),`event-${suffix}`],
  );
  assert.equal(event.rowCount, 1);

  await expectSqlState(
    () => client.query(
      `insert into payment_provider_events(
        provider,provider_event_id,event_type,signature_digest,payload_digest,
        normalized_payload_json,status,attempts,correlation_id
      ) values('test',$1,'payment.authorized',$2,$3,'{}','received',0,$4)`,
      [`evt-${suffix}`,"a".repeat(64),"b".repeat(64),`event-replay-${suffix}`],
    ),
    "23505",
    "duplicate_provider_event",
  );

  const claimed = await client.query(
    `update payment_provider_events
       set status='processing', attempts=attempts+1
     where id=$1 and status in ('received','failed') and attempts < 5
     returning attempts,status`,
    [event.rows[0].id],
  );
  assert.equal(claimed.rows[0].attempts, 1);
  assert.equal(claimed.rows[0].status, "processing");

  const failed = await client.query(
    `update payment_provider_events
       set status='failed',last_error='qualification',next_attempt_at=now()+interval '30 seconds'
     where id=$1 and status='processing'
     returning status`,
    [event.rows[0].id],
  );
  assert.equal(failed.rows[0].status, "failed");

  await client.query(
    `update payment_provider_events set attempts=5,status='processing' where id=$1`,
    [event.rows[0].id],
  );
  const dead = await client.query(
    `update payment_provider_events
       set status='dead_letter',last_error='qualification exhausted',next_attempt_at=null
     where id=$1 and status='processing' and attempts >= 5
     returning status`,
    [event.rows[0].id],
  );
  assert.equal(dead.rows[0].status, "dead_letter");

  const finding = await client.query(
    `insert into payment_reconciliation_findings(
      provider,marketplace_transaction_id,external_reference,finding_type,status,
      expected_json,observed_json,correlation_id
    ) values('test',$1,'pay_ref_1','amount_mismatch','open','{"amount":12000}',
      '{"amount":11900}',$2) returning id`,
    [tx.rows[0].id,`reconcile-${suffix}`],
  );
  assert.equal(finding.rowCount, 1);

  await expectSqlState(
    () => client.query(
      `insert into payment_reconciliation_findings(
        provider,external_reference,finding_type,status,correlation_id
      ) values('test','bad','imaginary','open',$1)`,
      [`bad-reconcile-${suffix}`],
    ),
    "23514",
    "bad_reconciliation_type",
  );

  await client.query("rollback");

  console.log("payment-foundation runtime qualification: PASS");
  console.log("verified: seller-account uniqueness, operation idempotency/constraints, webhook replay rejection, retry/dead-letter states, and reconciliation constraints");
} finally {
  await client.end();
}
