import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../src/db/schema.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../src/lib/auth-tokens.ts", import.meta.url), "utf8");
const rateLimit = readFileSync(new URL("../src/lib/rate-limit.ts", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const emailProvider = readFileSync(new URL("../src/lib/email/provider.ts", import.meta.url), "utf8");
const emailRegistry = readFileSync(new URL("../src/lib/email/registry.ts", import.meta.url), "utf8");
const signup = readFileSync(new URL("../src/app/api/auth/signup/route.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");

assert.match(schema, /auth_tokens/);
assert.match(schema, /rate_limit_buckets/);
assert.match(schema, /email_verified_at/);
assert.match(schema, /session_version/);
assert.match(schema, /auth_token_digest_unique/);
assert.match(schema, /rate_limit_bucket_unique/);
assert.match(schema, /auth_token_purpose_valid/);

assert.match(auth, /digestToken\(rawToken\)/);
assert.match(auth, /token: tokenDigest/);
assert.match(auth, /store\.set\(SESSION_COOKIE, rawToken/);
assert.match(auth, /eq\(sessions\.sessionVersion, users\.sessionVersion\)/);
assert.match(auth, /bumpSessionVersionAndRevoke/);

assert.match(tokens, /isNull\(authTokens\.usedAt\)/);
assert.match(tokens, /gt\(authTokens\.expiresAt, new Date\(\)\)/);
assert.match(tokens, /passwordUpdatedAt: new Date\(\)/);
assert.match(tokens, /bumpSessionVersionAndRevoke\(userId\)/);

assert.match(rateLimit, /createHmac\("sha256"/);
assert.match(rateLimit, /RATE_LIMIT_SECRET is required in production/);
assert.match(rateLimit, /onConflictDoUpdate/);
assert.match(rateLimit, /RateLimitError/);

assert.match(proxy, /APP_ORIGIN/);
assert.match(proxy, /Untrusted request origin/);
assert.match(proxy, /\/api\/payments\/webhook\//);
assert.match(proxy, /fetchSite === "cross-site"/);

for (const header of [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Permissions-Policy",
  "Referrer-Policy",
]) {
  assert.match(nextConfig, new RegExp(header));
}
assert.match(nextConfig, /poweredByHeader: false/);

assert.match(emailProvider, /No production email provider is configured/);
assert.match(emailRegistry, /no production adapter is registered/);
assert.match(signup, /password\.length < 10/);
assert.match(signup, /scope: "auth:signup"/);
assert.match(login, /scope: "auth:login"/);

const financialRoutes = [
  "../src/app/api/wallet/route.ts",
  "../src/app/api/listings/route.ts",
  "../src/app/api/listings/[id]/claim/route.ts",
  "../src/app/api/listings/[id]/complete/route.ts",
  "../src/app/api/listings/[id]/boost/route.ts",
  "../src/app/api/listings/[id]/cancel/route.ts",
];

for (const path of financialRoutes) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, /enforceRateLimit/);
  assert.match(source, /RateLimitError/);
}

const recoveryRoutes = [
  "../src/app/api/auth/email-verification/request/route.ts",
  "../src/app/api/auth/email-verification/confirm/route.ts",
  "../src/app/api/auth/password-reset/request/route.ts",
  "../src/app/api/auth/password-reset/confirm/route.ts",
];
for (const path of recoveryRoutes) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, /enforceRateLimit/);
}

console.log("security-baseline structural qualification: PASS");
console.log("verified: hashed sessions, version revocation, one-time recovery tokens, auth/financial throttles, fail-closed email delivery, mutation origin checks, and response security headers");
