# Washermann — System Architecture

## Architecture Style

**Modular Monolith** (Phase 1 → MVP)

The backend is a single NestJS application structured into feature modules with clear separation of concerns. Each module owns its entities, services, and controllers. There are no cross-module direct repository calls — modules communicate only through exported services.

This enables easy extraction into microservices if required at scale, without rewriting business logic.

---

## High-Level Architecture

```
Client Apps (Flutter Mobile + Next.js Web)
         │
         ▼
  Cloudflare (CDN, DNS, SSL, DDoS)
         │
         ▼
  Render (NestJS API — Load Balanced)
    ├─ Auth Module
    ├─ Users Module
    ├─ Companies Module          ← Phase 2
    ├─ Tiers Module              ← Phase 2
    ├─ Wallets Module            ← Phase 3
    ├─ Ledger Module             ← Phase 3
    ├─ Benefits Module           ← Phase 4
    ├─ Washermen Module          ← Phase 5
    ├─ Geo Module                ← Phase 5
    ├─ Orders Module             ← Phase 6
    ├─ Payments Module           ← Phase 6
    ├─ Escrow Module             ← Phase 6
    ├─ Payouts Module            ← Phase 6
    ├─ Coupons Module            ← Phase 7
    ├─ Disputes Module           ← Phase 8
    ├─ Notifications Module      ← Phase 9
    ├─ Loyalty Module            ← Phase 10
    ├─ Admin Module              ← Phase 10
    └─ Jobs Module               ← Phase 10
         │
         ├─ PostgreSQL (Neon)    ← Primary data store
         ├─ Redis (Upstash)      ← Tokens, queues, rate limiting
         └─ Background Workers  ← BullMQ jobs
```

---

## Data Flow: Order Payment (Full)

```
User places order
      │
      ▼
OrdersModule validates items + cost
      │
      ▼
PaymentsModule evaluates available sources:
  ┌─────────────────────────────────────────┐
  │ 1. BenefitsModule → benefit allocation  │
  │ 2. WalletsModule → personal wallet      │
  │ 3. CouponsModule → coupon value         │
  └─────────────────────────────────────────┘
      │ Atomic deduction across all sources
      ▼
EscrowModule creates escrow record
      │
      ▼
LedgerModule creates one entry per source
      │
      ▼
Order status: Created → Accepted → ... → Completed
      │
      ▼
Admin triggers payout
      │
      ▼
PayoutsModule → Paystack Transfer → Washerman bank account
      │
      ▼
LedgerModule records payout
```

---

## Database Design Principles

1. **All IDs are UUIDs** — no sequential integers exposed externally
2. **Ledger is immutable** — entries are never updated or deleted
3. **Wallet balance = derived** — computed from ledger, wallets table is a cache
4. **Soft state in statuses** — nothing is hard-deleted; statuses control visibility
5. **Timestamps on everything** — `created_at` and `updated_at` on all tables

---

## Security Architecture

| Concern | Implementation |
|---------|---------------|
| Authentication | JWT (access 15min, refresh 7d) |
| Token storage | Refresh token JTI stored in Redis |
| Token rotation | New JTI on every refresh; reuse = invalidate all |
| Password storage | bcrypt, 12 rounds |
| RBAC | Passport + custom guards, enforced globally |
| Input validation | class-validator on all DTOs, whitelist mode |
| Financial endpoints | HMAC-SHA256 secret header on wallet conversion |
| Webhook verification | Paystack HMAC-SHA512 signature check |
| Enumeration prevention | Auth check endpoints always return 200 |

---

## Redis Key Conventions

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `refresh:{userId}` | 7 days | Refresh token JTI for rotation |
| `reset:{token}` | 1 hour | Password reset token |
| `invite:{token}` | 7 days | Invite deep-link token |
| `rate:{ip}:{endpoint}` | 1 min | Rate limiting |

---

## Background Jobs (Phase 10)

| Job | Schedule | Description |
|-----|----------|-------------|
| Benefit Reset | 1st of month, 00:00 | Expire old allocations + create new ones |
| Benefit Expiry | Daily 23:59 | Expire any remaining cycle-end allocations |
| Inactivity Check | Weekly | Flag wallets inactive > 90 days |
| Reconciliation | Daily 02:00 | Compare ledger vs wallets vs Paystack |
| Auto-confirm Orders | Every 30 min | Auto-confirm orders past timeout threshold |
| Vendor Timeout | Every 5 min | Reassign orders with no vendor response |

---

## WebSocket Architecture

Socket.io rooms per actor:
- `user:{id}` — User receives order updates, payment confirmations, disputes
- `washerman:{id}` — Vendor receives new orders, status events
- `admin` — Admin receives disputes, system alerts

All socket events are **server → client only** for financial/order events (client subscribes, server pushes).
