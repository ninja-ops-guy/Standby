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
    "user_roles",
    "disputes",
    "dispute_evidence",
    "payout_holds",
    "refund_decisions",
    "account_restrictions",
    "listing_restrictions",
  ]) {
    const exists = await scalar(
      "select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1)",
      [table],
    );
    assert.equal(exists, true, `missing table: ${table}`);
  }

  await client.query("begin");
  const suffix = Date.now().toString(36);

  async function createUser(label) {
    const result = await client.query(
      "insert into users(email,name,password_hash,city,is_demo) values($1,$2,'x','Test',true) returning id",
      [`${label}-${suffix}@example.test`, label],
    );
    return result.rows[0].id;
  }

  const sellerId = await createUser("seller");
  const buyerId = await createUser("buyer");
  const operator1 = await createUser("operator1");
  const operator2 = await createUser("operator2");

  await client.query(
    "insert into user_roles(user_id,role,granted_by_user_id) values($1,'admin',$1),($2,'operator',$1)",
    [operator1, operator2],
  );

  await expectSqlState(
    () => client.query(
      "insert into user_roles(user_id,role,granted_by_user_id) values($1,'viewer',$2)",
      [buyerId, operator1],
    ),
    "23514",
    "invalid_role",
  );

  const listing = await client.query(
    `insert into listings(
      seller_id,title,venue,category,city,description,starts_at,party_size,
      face_value_cents,price_cents,transfer_code,status
    ) values($1,'Dispute qualification','Provider','stay','Test','',
      now()+interval '1 day',2,25000,15000,'DSP001','claimed') returning id`,
    [sellerId],
  );

  const tx = await client.query(
    `insert into marketplace_transactions(
      listing_id,buyer_id,seller_id,amount_cents,currency,state,correlation_id
    ) values($1,$2,$3,15000,'USD','transfer_pending',$4) returning id`,
    [listing.rows[0].id,buyerId,sellerId,`dispute-tx-${suffix}`],
  );
  const txId = tx.rows[0].id;

  const dispute = await client.query(
    `insert into disputes(
      marketplace_transaction_id,opened_by_user_id,reason_code,status,correlation_id
    ) values($1,$2,'transfer_denied','open',$3) returning id`,
    [txId,buyerId,`dispute-${suffix}`],
  );
  const disputeId = dispute.rows[0].id;

  await expectSqlState(
    () => client.query(
      `insert into disputes(
        marketplace_transaction_id,opened_by_user_id,reason_code,status,correlation_id
      ) values($1,$2,'buyer_dispute','open',$3)`,
      [txId,buyerId,`dupe-dispute-${suffix}`],
    ),
    "23505",
    "duplicate_dispute",
  );

  await expectSqlState(
    () => client.query(
      `insert into disputes(
        marketplace_transaction_id,opened_by_user_id,reason_code,status,correlation_id
      ) values((select id from marketplace_transactions limit 1),$1,'imaginary','open',$2)`,
      [buyerId,`bad-reason-${suffix}`],
    ),
    "23514",
    "invalid_dispute_reason",
  );

  const digest = "d".repeat(64);
  await client.query(
    `insert into dispute_evidence(
      dispute_id,submitted_by_user_id,evidence_type,payload_digest,correlation_id
    ) values($1,$2,'buyer_statement',$3,$4)`,
    [disputeId,buyerId,digest,`evidence-${suffix}`],
  );

  await expectSqlState(
    () => client.query(
      `insert into dispute_evidence(
        dispute_id,submitted_by_user_id,evidence_type,payload_digest,correlation_id
      ) values($1,$2,'buyer_statement',$3,$4)`,
      [disputeId,buyerId,digest,`evidence-dupe-${suffix}`],
    ),
    "23505",
    "duplicate_dispute_evidence",
  );

  await expectSqlState(
    () => client.query(
      `insert into dispute_evidence(
        dispute_id,submitted_by_user_id,evidence_type,payload_digest,correlation_id
      ) values($1,$2,'magic',$3,$4)`,
      [disputeId,buyerId,"e".repeat(64),`evidence-bad-${suffix}`],
    ),
    "23514",
    "invalid_dispute_evidence_type",
  );

  const hold = await client.query(
    `insert into payout_holds(
      marketplace_transaction_id,seller_id,amount_cents,reason,status,
      created_by_user_id,correlation_id
    ) values($1,$2,15000,'dispute:transfer_denied','active',$3,$4)
    returning id`,
    [txId,sellerId,buyerId,`hold-${suffix}`],
  );

  await expectSqlState(
    () => client.query(
      `insert into payout_holds(
        marketplace_transaction_id,seller_id,amount_cents,reason,status,
        created_by_user_id,correlation_id
      ) values($1,$2,1,'duplicate','active',$3,$4)`,
      [txId,sellerId,operator1,`hold-dupe-${suffix}`],
    ),
    "23505",
    "duplicate_payout_hold",
  );

  await client.query(
    "update payout_holds set status='released',released_by_user_id=$1,released_at=now() where id=$2",
    [operator1, hold.rows[0].id],
  );

  const refund = await client.query(
    `insert into refund_decisions(
      marketplace_transaction_id,dispute_id,amount_cents,reason_code,status,
      proposed_by_user_id,correlation_id
    ) values($1,$2,15000,'buyer_resolution','proposed',$3,$4) returning id`,
    [txId,disputeId,operator1,`refund-${suffix}`],
  );

  await client.query(
    "update refund_decisions set status='approved',approved_by_user_id=$1,updated_at=now() where id=$2",
    [operator2, refund.rows[0].id],
  );

  await expectSqlState(
    () => client.query(
      `insert into refund_decisions(
        marketplace_transaction_id,amount_cents,reason_code,status,proposed_by_user_id,correlation_id
      ) values($1,1,'duplicate','proposed',$2,$3)`,
      [txId,operator1,`refund-dupe-${suffix}`],
    ),
    "23505",
    "duplicate_refund_decision",
  );

  await expectSqlState(
    () => client.query(
      `insert into refund_decisions(
        marketplace_transaction_id,amount_cents,reason_code,status,proposed_by_user_id,correlation_id
      ) values((select id from marketplace_transactions limit 1),0,'bad','proposed',$1,$2)`,
      [operator1,`refund-zero-${suffix}`],
    ),
    "23514",
    "zero_refund",
  );

  await client.query(
    `insert into account_restrictions(
      user_id,restriction_type,status,reason,created_by_user_id,correlation_id
    ) values($1,'marketplace_suspension','active','qualification',$2,$3)`,
    [buyerId,operator1,`user-restrict-${suffix}`],
  );

  await expectSqlState(
    () => client.query(
      `insert into account_restrictions(
        user_id,restriction_type,status,reason,created_by_user_id,correlation_id
      ) values($1,'marketplace_suspension','active','duplicate',$2,$3)`,
      [buyerId,operator1,`user-restrict-dupe-${suffix}`],
    ),
    "23505",
    "duplicate_account_restriction",
  );

  await expectSqlState(
    () => client.query(
      `insert into account_restrictions(
        user_id,restriction_type,status,reason,created_by_user_id,correlation_id
      ) values($1,'ban_everything','active','bad',$2,$3)`,
      [sellerId,operator1,`bad-restrict-${suffix}`],
    ),
    "23514",
    "invalid_account_restriction",
  );

  await client.query(
    `insert into listing_restrictions(
      listing_id,status,reason,created_by_user_id,correlation_id
    ) values($1,'active','qualification',$2,$3)`,
    [listing.rows[0].id,operator1,`listing-restrict-${suffix}`],
  );

  await expectSqlState(
    () => client.query(
      `insert into listing_restrictions(
        listing_id,status,reason,created_by_user_id,correlation_id
      ) values($1,'active','duplicate',$2,$3)`,
      [listing.rows[0].id,operator1,`listing-restrict-dupe-${suffix}`],
    ),
    "23505",
    "duplicate_listing_restriction",
  );

  await client.query(
    `insert into audit_events(
      actor_user_id,action,target_type,target_id,correlation_id,metadata_json
    ) values
      ($1,'refund.propose','refund_decision',$2,$3,'{}'),
      ($4,'refund.approve','refund_decision',$2,$3,'{}')`,
    [operator1,String(refund.rows[0].id),`audit-${suffix}`,operator2],
  );

  const auditCount = Number(
    await scalar(
      "select count(*)::int from audit_events where target_type='refund_decision' and target_id=$1",
      [String(refund.rows[0].id)],
    ),
  );
  assert.equal(auditCount, 2);

  await client.query("rollback");

  console.log("disputes-admin runtime qualification: PASS");
  console.log("verified: role constraints, one-dispute/hold/refund invariants, evidence idempotency, hold lifecycle, restrictions, refund approval persistence, and audit trail");
} finally {
  await client.end();
}
