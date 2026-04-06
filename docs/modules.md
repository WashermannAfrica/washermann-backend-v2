# Module Breakdown & Implementation Phases

## Phase 1 — Foundation ✅ (Current)
**Modules:** AuthModule, UsersModule, RedisModule, DatabaseModule

| Module | Status | Key Responsibilities |
|--------|--------|---------------------|
| `AuthModule` | ✅ Done | Register, login, JWT, refresh, check-identifier, activate, set-password, forgot/reset password |
| `UsersModule` | ✅ Done | Profile CRUD, address management |
| `RedisModule` | ✅ Done | Global Redis client (tokens, sessions) |
| `DatabaseModule` | ✅ Done | TypeORM PostgreSQL connection |

---

## Phase 2 — Company & Tier Infrastructure
**Modules:** CompaniesModule, TiersModule

| Module | Responsibilities |
|--------|-----------------|
| `CompaniesModule` | Company CRUD, admin management, employee add/remove/reassign, invite flow |
| `TiersModule` | Tier CRUD, user-tier assignments, `company_user_assignments` |

---

## Phase 3 — Financial Core
**Modules:** WalletsModule, LedgerModule, PaymentsModule (partial)

| Module | Responsibilities |
|--------|-----------------|
| `WalletsModule` | Auto-create wallet on user/company creation, balance queries, funding initiation |
| `LedgerModule` | Immutable ledger entries, queries by wallet/reference |
| `PaymentsModule` | Paystack payment session, webhook ingestion, HMAC validation |

---

## Phase 4 — Benefit Allocation
**Modules:** BenefitsModule, JobsModule (partial)

| Module | Responsibilities |
|--------|-----------------|
| `BenefitsModule` | Auto-create allocation on tier assignment, deduct on order payment |
| `JobsModule` (partial) | Monthly reset cron, expiry cron |

---

## Phase 5 — Washermen & Geolocation
**Modules:** WashermenModule, GeoModule

| Module | Responsibilities |
|--------|-----------------|
| `WashermenModule` | Admin registration, invite flow, bank accounts, availability |
| `GeoModule` | PostGIS radius query, nearby vendor API |

---

## Phase 6 — Orders, Escrow & Payouts
**Modules:** OrdersModule, PaymentsModule (complete), EscrowModule, PayoutsModule

| Module | Responsibilities |
|--------|-----------------|
| `OrdersModule` | Order lifecycle, status machine, sub-statuses, auto-confirm |
| `PaymentsModule` | Hybrid payment logic, atomic multi-source deduction |
| `EscrowModule` | Escrow state machine, hold/release |
| `PayoutsModule` | Admin-triggered payouts, Paystack transfers |

---

## Phase 7 — Coupons
**Module:** CouponsModule

---

## Phase 8 — Disputes
**Module:** DisputesModule

---

## Phase 9 — Notifications
**Module:** NotificationsModule (Resend + Termii + FCM)

---

## Phase 10 — Admin, Loyalty & Jobs
**Modules:** AdminModule, LoyaltyModule, JobsModule (complete)

---

## Order Status State Machine

```
Created
  └─► Accepted
        └─► PickedUp
              └─► InProgress
                    ├─ [sub] Washing
                    ├─ [sub] Drying
                    ├─ [sub] Ironing
                    └─ [sub] Folding
              └─► Ready
                    └─► Completed
                          └─► Settled
```

## Escrow State Machine

```
FundsHeld
  └─► OrderInProgress
        ├─► (Dispute) → Investigation → Resolution
        └─► AwaitingConfirmation
              └─► ReleaseApproved
                    └─► PayoutProcessed
                          └─► Completed
```

## Dispute State Machine

```
Open → UnderInvestigation → Resolved → Closed
```
