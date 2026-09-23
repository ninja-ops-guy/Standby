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
  for (const table of ["auth_tokens", "rate_limit_buckets"]) {
    const exists = await scalar(
      "select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1)",
      [table],
    );
    assert.equal(exists, true, `missing table: ${table}`);
  }

  await client.query("begin");
  const suffix = Date.now().toString(36);

  const user = await client.query(
    `insert into users(
      email,name,password_hash,city,is_demo,email_verified_at,session_version
    ) values($1,'Security User','x','Test',true,null,0)
    returning id,session_version,email_verified_at`,
    [`security-${suffix}@example.test`],
  );
  const userId = user.rows[0].id;
  assert.equal(user.rows[0].session_version, 0);
  assert.equal(user.rows[0].email_verified_at, null);

  const sessionDigest = "a".repeat(64);
  await client.query(
    `insert into sessions(token,user_id,expires_at,session_version,last_rotated_at)
     values($1,$2,now()+interval '1 day',0,now())`,
    [sessionDigest,userId],
  );

  const activeSession = Number(
    await scalar(
      `select count(*)::int from sessions s join users u on u.id=s.user_id
       where s.token=$1 and s.expires_at > now() and s.session_version=u.session_version`,
      [sessionDigest],
    ),
  );
  assert.equal(activeSession, 1);

  await client.query("update users set session_version=session_version+1 where id=$1", [userId]);
  const invalidatedSession = Number(
    await scalar(
      `select count(*)::int from sessions s join users u on u.id=s.user_id
       where s.token=$1 and s.expires_at > now() and s.session_version=u.session_version`,
      [sessionDigest],
    ),
  );
  assert.equal(invalidatedSession, 0, "session version bump did not invalidate prior session");

  const verificationDigest = "b".repeat(64);
  const authToken = await client.query(
    `insert into auth_tokens(user_id,purpose,token_digest,expires_at)
     values($1,'email_verification',$2,now()+interval '1 hour') returning id`,
    [userId,verificationDigest],
  );

  await expectSqlState(
    () => client.query(
      `insert into auth_tokens(user_id,purpose,token_digest,expires_at)
       values($1,'magic',$2,now()+interval '1 hour')`,
      [userId,"c".repeat(64)],
    ),
    "23514",
    "invalid_auth_token_purpose",
  );

  await expectSqlState(
    () => client.query(
      `insert into auth_tokens(user_id,purpose,token_digest,expires_at)
       values($1,'email_verification',$2,now()+interval '1 hour')`,
      [userId,verificationDigest],
    ),
    "23505",
    "duplicate_auth_token_digest",
  );

  const firstUse = await client.query(
    "update auth_tokens set used_at=now() where id=$1 and used_at is null returning id",
    [authToken.rows[0].id],
  );
  assert.equal(firstUse.rowCount, 1);
  const replayUse = await client.query(
    "update auth_tokens set used_at=now() where id=$1 and used_at is null returning id",
    [authToken.rows[0].id],
  );
  assert.equal(replayUse.rowCount, 0, "one-time auth token was reusable");

  const expiredDigest = "d".repeat(64);
  await client.query(
    `insert into auth_tokens(user_id,purpose,token_digest,expires_at)
     values($1,'password_reset',$2,now()-interval '1 minute')`,
    [userId,expiredDigest],
  );
  const validExpired = Number(
    await scalar(
      "select count(*)::int from auth_tokens where token_digest=$1 and expires_at > now() and used_at is null",
      [expiredDigest],
    ),
  );
  assert.equal(validExpired, 0, "expired auth token remained valid");

  const bucketKey = "e".repeat(64);
  const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000);
  await client.query(
    `insert into rate_limit_buckets(bucket_key,window_start,count,expires_at)
     values($1,$2,1,$3)
     on conflict(bucket_key,window_start)
     do update set count=rate_limit_buckets.count+1`,
    [bucketKey,windowStart,new Date(windowStart.getTime()+120000)],
  );
  await client.query(
    `insert into rate_limit_buckets(bucket_key,window_start,count,expires_at)
     values($1,$2,1,$3)
     on conflict(bucket_key,window_start)
     do update set count=rate_limit_buckets.count+1`,
    [bucketKey,windowStart,new Date(windowStart.getTime()+120000)],
  );
  const count = Number(
    await scalar(
      "select count from rate_limit_buckets where bucket_key=$1 and window_start=$2",
      [bucketKey,windowStart],
    ),
  );
  assert.equal(count, 2, "rate-limit bucket did not increment atomically");

  await expectSqlState(
    () => client.query(
      `insert into rate_limit_buckets(bucket_key,window_start,count,expires_at)
       values($1,now(),-1,now()+interval '1 minute')`,
      ["f".repeat(64)],
    ),
    "23514",
    "negative_rate_limit_count",
  );

  await client.query("rollback");

  console.log("security-baseline runtime qualification: PASS");
  console.log("verified: session-version invalidation, auth-token constraints/one-time use/expiry, and durable rate-limit bucket invariants");
} finally {
  await client.end();
}
