# Washermann API — Backend Documentation

## What Is Washermann?

Washermann is a digital platform that connects individuals and organizations to verified laundry service providers ("Washermen"). It combines:
- A **marketplace** for discovering and booking laundry services
- A **corporate benefit system** for companies to sponsor employee laundry usage
- A **Wash Points financial engine** with wallets, ledger, escrow, and payouts

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS (TypeScript) |
| Database | PostgreSQL (Neon) |
| Cache / Queue | Redis (Upstash) + BullMQ |
| ORM | TypeORM |
| Auth | JWT (access + refresh) + Passport |
| Payments | Paystack |
| Email | Resend |
| SMS | Termii |
| Push | Firebase FCM |
| Storage | Cloudflare R2 |
| Docs | Swagger (OpenAPI 3) |

---

## Documentation Index

| File | Description |
|------|-------------|
| [architecture.md](./architecture.md) | System architecture, module map, data flow |
| [modules.md](./modules.md) | Module breakdown, phases, responsibilities |
| [api-conventions.md](./api-conventions.md) | Request/response standards, error codes, auth patterns |
| [environment.md](./environment.md) | Environment variables reference |

---

## Quick Start (Local Development)

```bash
# 1. Clone repo
git clone https://github.com/your-org/washermann-api.git
cd washermann-api

# 2. Install dependencies
npm install

# 3. Copy env file and fill in values
cp .env.example .env

# 4. Start Postgres + Redis via Docker
docker-compose up postgres redis -d

# 5. Run database migrations
npm run migration:run

# 6. Start the API
npm run start:dev

# API: http://localhost:3000/api/v1
# Swagger: http://localhost:3000/api/v1/docs
```

---

## Key Concepts

### Wash Points
- Internal unit of value. ₦1 = 1 Wash Point (configurable).
- All transactions on the platform use points — never raw fiat.
- Two types: **Persistent** (wallet-funded, don't expire) and **Expiring** (company benefit allocations, reset monthly).

### Identifier-First Auth Flow
Users enter their email or phone first. The system checks account state and routes accordingly:
- `not_found` → Registration
- `pending_activation` → Activation (pre-created by company)
- `active` → Login

### Hybrid Payments
Orders can be paid from multiple sources simultaneously:
1. Company benefit allocation (expiring points)
2. Personal wallet (persistent points)
3. Coupons

Sources are deducted atomically. Total must equal order cost exactly.

### Escrow
All order payments are held in escrow until the order is confirmed as completed. Only then does the admin trigger a payout to the Washerman.
