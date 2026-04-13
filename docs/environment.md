# Environment Variables Reference

Copy `.env.example` to `.env` and fill in the values below.

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` \| `production` \| `staging` |
| `PORT` | `3000` | API server port |
| `API_PREFIX` | `api/v1` | Global route prefix |
| `APP_NAME` | `Washermann API` | Application name (used in logs) |
| `FRONTEND_URL` | `http://localhost:3001` | CORS allowed origin |

## Database (Neon / PostgreSQL)

| Variable | Description |
|----------|-------------|
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port (default 5432) |
| `DB_USERNAME` | Database username |
| `DB_PASSWORD` | Database password |
| `DB_NAME` | Database name |
| `DB_SSL` | `true` in production (Neon requires SSL) |
| `DB_SYNCHRONIZE` | `false` always — use migrations |
| `DB_LOGGING` | `true` for local debugging only |
| `DB_MIGRATIONS_RUN` | `true` to auto-run migrations on startup |

## Redis (Upstash)

| Variable | Description |
|----------|-------------|
| `REDIS_HOST` | Redis host (for local Docker) |
| `REDIS_PORT` | Redis port (default 6379) |
| `REDIS_PASSWORD` | Redis password (required for Upstash) |
| `REDIS_TLS` | `true` for Upstash |
| `REDIS_URL` | Full Upstash URL (overrides host/port when set) |

## JWT

| Variable | Description |
|----------|-------------|
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (different from access) |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL (e.g. `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL (e.g. `7d`) |
| `JWT_RESET_PASSWORD_EXPIRES_IN` | Reset token TTL (e.g. `1h`) |
| `JWT_INVITE_EXPIRES_IN` | Invite token TTL (e.g. `7d`) |

## Paystack

| Variable | Description |
|----------|-------------|
| `PAYSTACK_SECRET_KEY` | Paystack secret key (`sk_test_` or `sk_live_`) |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `PAYSTACK_WEBHOOK_SECRET` | Used to verify webhook HMAC-SHA512 signature |

> Get from: https://dashboard.paystack.com → Settings → API Keys

## Resend (Email)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key (`re_xxxx`) |
| `RESEND_FROM_EMAIL` | Verified sending address |
| `RESEND_FROM_NAME` | Display name on emails |

> Get from: https://resend.com → API Keys

## Termii (SMS)

| Variable | Description |
|----------|-------------|
| `TERMII_API_KEY` | Termii API key |
| `TERMII_SENDER_ID` | Approved sender ID (e.g. `Washermann`) |

> Get from: https://termii.com → Dashboard

## Firebase (Push Notifications)

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key (include `\n` for newlines) |

> Get from: Firebase Console → Project Settings → Service Accounts

## Cloudflare R2 (Storage)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | Public CDN URL for the bucket |

## Platform Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `WASH_POINT_CONVERSION_RATE` | `1` | ₦1 = N Wash Points |
| `ORDER_AUTO_CONFIRM_HOURS` | `24` | Hours before order is auto-confirmed |
| `VENDOR_RESPONSE_TIMEOUT_MINUTES` | `30` | Minutes before reassigning unaccepted order |
| `INACTIVITY_THRESHOLD_DAYS` | `90` | Days of wallet inactivity before flagging |
| `WALLET_CONVERSION_SECRET` | — | HMAC secret for wallet credit operations |

## Sentry

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry project DSN for error tracking |
