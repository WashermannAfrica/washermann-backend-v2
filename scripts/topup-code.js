#!/usr/bin/env node
/**
 * QA helper — generates a valid X-WM-Topup-Code for POST /wallets/me/topup.
 *
 * The code is what the mobile app computes on-device:
 *   topupKey   = HMAC-SHA256(TOPUP_SIGNING_SECRET, userId)     ← the server returns this as `topupKey` at login
 *   timeWindow = floor(Date.now() / (TOPUP_WINDOW_SECONDS * 1000))
 *   code       = HMAC-SHA256(TOPUP_CLIENT_APP_SECRET, `${userId}:${topupKey}:${timeWindow}`)
 *
 * Usage (from washermann-api/, secrets read from .env):
 *   node scripts/topup-code.js <userId>
 *
 * Or with explicit secrets / against another environment's secrets:
 *   TOPUP_SIGNING_SECRET=... TOPUP_CLIENT_APP_SECRET=... node scripts/topup-code.js <userId>
 *
 * The code is valid for the current 30s window (server tolerates ±1 window) —
 * send the request within ~30s of generating it, e.g.:
 *   curl -X POST $API/api/v1/wallets/me/topup \
 *     -H "Authorization: Bearer $TOKEN" \
 *     -H "X-WM-Topup-Code: $(node scripts/topup-code.js $USER_ID)" \
 *     -H "Content-Type: application/json" \
 *     -d '{"amountNaira": 1000}'
 */
const { createHmac } = require('crypto');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

// Minimal .env loader — no dependency on dotenv being installed globally
function loadEnvFile() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnvFile();

const userId = process.argv[2];
if (!userId) {
  console.error('Usage: node scripts/topup-code.js <userId>');
  process.exit(1);
}

const signingSecret = process.env.TOPUP_SIGNING_SECRET;
const clientSecret  = process.env.TOPUP_CLIENT_APP_SECRET;
const windowSeconds = Number(process.env.TOPUP_CODE_WINDOW_SECONDS || 30);

if (!signingSecret || !clientSecret) {
  console.error(
    'TOPUP_SIGNING_SECRET and/or TOPUP_CLIENT_APP_SECRET not set (env or ../.env).\n' +
    'Note: if they are ALSO unset on the API you are testing, the guard skips validation ' +
    'and any header value (or none) passes.',
  );
  process.exit(1);
}

const topupKey   = createHmac('sha256', signingSecret).update(userId).digest('hex');
const timeWindow = Math.floor(Date.now() / (windowSeconds * 1000));
const code       = createHmac('sha256', clientSecret)
  .update(`${userId}:${topupKey}:${timeWindow}`)
  .digest('hex');

// Print only the code on stdout so it can be command-substituted into curl
console.log(code);
console.error(`(valid ~${windowSeconds}s — window ${timeWindow}; topupKey ${topupKey.slice(0, 8)}…)`);
