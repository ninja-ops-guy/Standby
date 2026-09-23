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

async function expectCheckViolation(fn, label) {
  await client.query(`savepoint ${label}`);
  let rejected = false;
  try {
    await fn();
  } catch (error) {
    rejected = error?.code === "23514";
    await client.query(`rollback to savepoint ${label}`);
  }
  assert.equal(rejected, true, `${label} was not rejected by a check constraint`);
}

try {
  for (const table of [
    "reservation_policies",
    "listing_policy_bindings",
    "transaction_policy_snapshots",
    "transfer_evidence",
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
    "insert into users(email,name,password_hash,city,is_demo) values($1,'Policy Seller','x','Test',true) returning id",
    [`policy-seller-${suffix}@example.test`],
  );
  const buyer = await client.query(
    "insert into users(email,name,password_hash,city,is_demo) values($1,'Policy Buyer','x','Test',true) returning id",
    [`policy-buyer-${suffix}@example.test`],
  );
  const listing = await client.query(
    `insert into listings(
      seller_id,title,venue,category,city,description,starts_at,party_size,
      face_value_cents,price_cents,transfer_code,status
    ) values($1,'Policy qualification','Provider X','stay','Test','',
      now()+interval '2 days',2,30000,18000,'POL001','live') returning id`,
    [seller.rows[0].id],
  );

  await expectCheckViolation(
    () => client.query(
      `insert into reservation_policies(
        provider_name,booking_type,jurisdiction,transferability,transfer_method,
        evidence_requirements_json,source_type,policy_version
      ) values('Provider X','hotel','US','maybe','official_digital_transfer',
        '["provider_receipt"]','provider_terms','bad')`,
    ),
    "bad_transferability",
  );

  await expectCheckViolation(
    () => client.query(
      `insert into reservation_policies(
        provider_name,booking_type,jurisdiction,transferability,transfer_method,
        evidence_requirements_json,source_type,policy_version
      ) values('Provider X','hotel','US','allowed','telepathy',
        '["provider_receipt"]','provider_terms','bad-method')`,
    ),
    "bad_method",
  );

  const policy = await client.query(
    `insert into reservation_policies(
      provider_name,booking_type,jurisdiction,transferability,transfer_method,
      transfer_fee_cents,deadline_rule,evidence_requirements_json,source_url,
      source_type,policy_version,verified_at
    ) values(
      'Provider X','hotel','US','allowed','provider_name_change',0,
      'before check-in','["provider_receipt","buyer_acknowledgement"]',
      'https://example.test/policy','provider_terms','v1',now()
    ) returning id`,
  );

  const binding = await client.query(
    `insert into listing_policy_bindings(
      listing_id,reservation_policy_id,bound_by_user_id,correlation_id
    ) values($1,$2,$3,$4) returning id`,
    [listing.rows[0].id, policy.rows[0].id, seller.rows[0].id, `bind-${suffix}`],
  );
  assert.equal(binding.rowCount, 1);

  await client.query("savepoint duplicate_binding");
  let duplicateBindingRejected = false;
  try {
    await client.query(
      `insert into listing_policy_bindings(
        listing_id,reservation_policy_id,bound_by_user_id,correlation_id
      ) values($1,$2,$3,$4)`,
      [listing.rows[0].id, policy.rows[0].id, seller.rows[0].id, `bind2-${suffix}`],
    );
  } catch (error) {
    duplicateBindingRejected = error?.code === "23505";
    await client.query("rollback to savepoint duplicate_binding");
  }
  assert.equal(duplicateBindingRejected, true, "listing accepted multiple current policy bindings");

  const tx = await client.query(
    `insert into marketplace_transactions(
      listing_id,buyer_id,seller_id,amount_cents,currency,state,correlation_id
    ) values($1,$2,$3,18000,'USD','payment_authorized',$4) returning id`,
    [listing.rows[0].id, buyer.rows[0].id, seller.rows[0].id, `tx-${suffix}`],
  );

  const snapshot = await client.query(
    `insert into transaction_policy_snapshots(
      marketplace_transaction_id,reservation_policy_id,provider_name,booking_type,
      jurisdiction,transferability,transfer_method,transfer_fee_cents,deadline_rule,
      evidence_requirements_json,source_url,source_type,policy_version,
      policy_verified_at,correlation_id
    )
    select $1,id,provider_name,booking_type,jurisdiction,transferability,transfer_method,
      transfer_fee_cents,deadline_rule,evidence_requirements_json,source_url,source_type,
      policy_version,verified_at,$2
    from reservation_policies where id=$3
    returning id`,
    [tx.rows[0].id, `snapshot-${suffix}`, policy.rows[0].id],
  );
  assert.equal(snapshot.rowCount, 1);

  await client.query("savepoint duplicate_snapshot");
  let duplicateSnapshotRejected = false;
  try {
    await client.query(
      `insert into transaction_policy_snapshots(
        marketplace_transaction_id,reservation_policy_id,provider_name,booking_type,
        jurisdiction,transferability,transfer_method,deadline_rule,
        evidence_requirements_json,source_type,policy_version,policy_verified_at,correlation_id
      ) values($1,$2,'Provider X','hotel','US','allowed','provider_name_change',
        'before check-in','["provider_receipt"]','provider_terms','v1',now(),$3)`,
      [tx.rows[0].id, policy.rows[0].id, `snapshot2-${suffix}`],
    );
  } catch (error) {
    duplicateSnapshotRejected = error?.code === "23505";
    await client.query("rollback to savepoint duplicate_snapshot");
  }
  assert.equal(duplicateSnapshotRejected, true, "transaction accepted multiple policy snapshots");

  await expectCheckViolation(
    () => client.query(
      `insert into transfer_evidence(
        marketplace_transaction_id,evidence_type,source,payload_digest,
        verification_status,correlation_id
      ) values($1,'magic','test',$2,'verified',$3)`,
      [tx.rows[0].id, "a".repeat(64), `evidence-${suffix}`],
    ),
    "bad_evidence_type",
  );

  const receiptDigest = "b".repeat(64);
  const evidence = await client.query(
    `insert into transfer_evidence(
      marketplace_transaction_id,evidence_type,source,payload_digest,
      verification_status,verified_by_user_id,verified_at,correlation_id
    ) values($1,'provider_receipt','provider',$2,'verified',$3,now(),$4)
    returning id`,
    [tx.rows[0].id, receiptDigest, seller.rows[0].id, `evidence-${suffix}`],
  );
  assert.equal(evidence.rowCount, 1);

  await client.query("savepoint duplicate_evidence");
  let duplicateEvidenceRejected = false;
  try {
    await client.query(
      `insert into transfer_evidence(
        marketplace_transaction_id,evidence_type,source,payload_digest,
        verification_status,correlation_id
      ) values($1,'provider_receipt','provider',$2,'verified',$3)`,
      [tx.rows[0].id, receiptDigest, `evidence-replay-${suffix}`],
    );
  } catch (error) {
    duplicateEvidenceRejected = error?.code === "23505";
    await client.query("rollback to savepoint duplicate_evidence");
  }
  assert.equal(duplicateEvidenceRejected, true, "duplicate evidence digest was accepted");

  const verifiedTypesBefore = await client.query(
    `select distinct evidence_type from transfer_evidence
     where marketplace_transaction_id=$1 and verification_status='verified'`,
    [tx.rows[0].id],
  );
  assert.deepEqual(verifiedTypesBefore.rows.map((r) => r.evidence_type).sort(), ["provider_receipt"]);

  await client.query(
    `insert into transfer_evidence(
      marketplace_transaction_id,evidence_type,source,payload_digest,
      verification_status,verified_by_user_id,verified_at,correlation_id
    ) values($1,'buyer_acknowledgement','buyer',$2,'verified',$3,now(),$4)`,
    [tx.rows[0].id, "c".repeat(64), buyer.rows[0].id, `buyer-ack-${suffix}`],
  );

  const verifiedTypesAfter = await client.query(
    `select distinct evidence_type from transfer_evidence
     where marketplace_transaction_id=$1 and verification_status='verified'`,
    [tx.rows[0].id],
  );
  assert.deepEqual(
    verifiedTypesAfter.rows.map((r) => r.evidence_type).sort(),
    ["buyer_acknowledgement", "provider_receipt"],
  );

  await client.query("rollback");

  console.log("transfer-policy runtime qualification: PASS");
  console.log("verified: policy constraints, single listing binding, immutable transaction snapshot, evidence constraints/idempotency, and required-evidence completion sequence");
} finally {
  await client.end();
}
