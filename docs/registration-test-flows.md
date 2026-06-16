# Washermann API — Registration / Onboarding Test Flows

End-to-end account-setup flows for every user type, with the exact endpoints, payloads
and sequencing **as currently implemented**. Where a flow is broken or missing in the
backend, it is flagged with ⚠️ and the required fix.

- **Base URL (local):** `http://localhost:3009/api/v1`  (global prefix is `api/v1`)
- **Auth:** every route needs `Authorization: Bearer <accessToken>` unless marked **Public**.
- All responses use the envelope `{ "success": true, "data": {...}, "message": "..." }`.

---

## Status at a glance

| # | Flow | Endpoint chain | Status |
|---|------|----------------|--------|
| 1 | User (self) | `register` → `verify-otp` | ✅ Works |
| 2 | User (company invitation) | `companies/:id/employees` → `auth/activate` → `verify-otp` | ⚠️ Works via `activate`; deep-link `set-password` is **broken** |
| 3 | Company (self) | `auth/company/register` → … | ⚠️ **Incomplete** — no approval/owner-promotion endpoint |
| 4 | Company (invited) | `companies` → `companies/activate` → `login` | ✅ Works |
| 5 | Vendor (self) | — | ❌ **Does not exist** (admin-created only) |
| 6 | Vendor (invited / admin-created) | `vendors` → `auth/set-password` → `verify-otp` → `vendors/:id/verify` | ✅ Works |
| 7 | Wash Rep | `reps` → `forgot-password` → `reset-password` → `reps/me/availability` | ✅ Works |
| 8 | Admin (first) / Staff (invited) | `auth/setup` · `admin/staff` → `auth/set-password` | ✅ Works |

---

## Local testing helpers — getting OTPs & invite tokens

Emails/SMS are sent via the notification service. In local testing the reliable way to read
the **OTP code** and **invite tokens** is straight from Redis (the same Redis the API uses —
start it with `docker compose up -d redis` if needed; adjust the container name).

```bash
# Find a user's id (after creating the account)
docker exec washermann-postgres psql -U postgres -d washermann \
  -c "SELECT id,email,status,roles FROM users ORDER BY created_at DESC LIMIT 5;"

# Read a verification OTP (keys: otp:verify:email:<userId> / otp:verify:phone:<userId>)
docker exec washermann-redis redis-cli --scan --pattern 'otp:verify:*'
docker exec washermann-redis redis-cli GET 'otp:verify:email:<userId>'

# Read a password-reset OTP (otp:reset:<userId>)
docker exec washermann-redis redis-cli GET 'otp:reset:<userId>'

# Find invite tokens
docker exec washermann-redis redis-cli --scan --pattern 'invite:*'          # vendor, staff (value = userId)
docker exec washermann-redis redis-cli --scan --pattern 'company_invite:*'   # company owner (value=userId) / employee (value=JSON)
```

> If your Redis isn't dockerized as `washermann-redis`, point `redis-cli` at the host/port in
> the API's `.env` (`REDIS_HOST` / `REDIS_PORT`).

---

## 1. User (self) — ✅

A normal customer signs up themselves and verifies.

```bash
# 1a. Register — creates ACTIVE user [USER], sends email OTP, returns tokens (already logged in)
curl -s -X POST $B/auth/register -H 'Content-Type: application/json' -d '{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "password": "SecureP@ss1"
}'
# → 201 { data: { user, accessToken, refreshToken, topupKey, verificationSent:true } }

# 1b. Verify email (read OTP from Redis — see helpers)
curl -s -X POST $B/auth/verify-otp -H 'Content-Type: application/json' -d '{
  "identifier": "jane@example.com",
  "otp": "123456",
  "channel": "email"
}'
# → 200 { data: { emailVerified:true } }   ← account ready
```
**Ready when:** `status=active`, `emailVerified=true`. (Wallet is created lazily on first `GET /wallets/me`.)
`register` requires email **or** phone; password min 8 chars.

---

## 2. User (company invitation) — ⚠️

An employee is added by a company owner/admin (or platform admin), then activates.

```bash
# Pre-req: an ACTIVE company + a tier id (see flow 4). Caller token = company owner/admin/ADMIN.
# 2a. Add employee — creates PENDING user [USER] (no password) + CompanyEmployee(ACTIVE)
curl -s -X POST $B/companies/$COMPANY_ID/employees \
  -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' -d '{
  "email": "employee@example.com",
  "tierId": "'$TIER_ID'"
}'
# → 201 employee record; an invite token is generated (see ⚠️ below)

# 2b. Employee activates (token-free path — works for any PENDING user)
curl -s -X POST $B/auth/activate -H 'Content-Type: application/json' -d '{
  "identifier": "employee@example.com",
  "password": "EmpP@ss123",
  "fullName": "Emeka Obi"
}'
# → 200 { user(ACTIVE), accessToken, ... } + OTP sent

# 2c. Verify OTP (as in flow 1b)
```
**Ready when:** employee `status=active`, linked via `CompanyEmployee` to the company + tier.

> ⚠️ **Bug — deep-link `set-password` does not work for employees.**
> The employee invite token is stored at `company_invite:{token}` as JSON `{userId,companyId}`
> ([companies.service.ts:572](../src/modules/companies/companies.service.ts)), but
> `/auth/set-password` reads `invite:{token}` and expects a plain `userId`
> ([auth.service.ts:203](../src/modules/auth/auth.service.ts)). So the emailed deep link fails.
> **Use `/auth/activate` (2b) instead**, or fix the employee invite to store
> `invite:{token}` → `userId` like vendor/staff do.

---

## 3. Company (self-registration) — ⚠️ Incomplete

A company signs itself up. Creates the company **and** a contact-person user, but the
company is left awaiting approval and **there is no endpoint to approve it / promote the owner.**

```bash
# 3a. Self-register — company=AWAITING_APPROVAL, contact user=PENDING [USER], OTP sent
curl -s -X POST $B/auth/company/register -H 'Content-Type: application/json' -d '{
  "companyName": "Acme Corp",
  "companyEmail": "info@acmecorp.com",
  "industry": "Technology",
  "numberOfWorkers": "120",
  "contactPersonName": "John Smith",
  "contactPersonEmail": "john@acmecorp.com",
  "password": "CompanyP@ss1"
}'
# → 201 { data: { companyId, message: "...Pending admin approval..." } }
```
The contact person can activate their **personal** account (`/auth/activate` + `verify-otp`),
but:
> ⚠️ **Gap:** no service method handles `activationStatus = awaiting_approval`. There is no
> endpoint that approves the company, sets it `ACTIVE`, grants `COMPANY_OWNER`, or creates the
> `CompanyAdmin` owner record. Until that's built, **use flow 4 (admin-invited company)** to get
> a usable company. Fix = add an admin "approve company" endpoint that mirrors the tail of
> `activateCompany` (promote owner, create CompanyAdmin, set ACTIVE).

---

## 4. Company (invited by platform admin) — ✅

Platform admin creates the company; the owner activates via the emailed token.

```bash
# 4a. Admin creates company — PENDING + company_invite:{token} (48h)
curl -s -X POST $B/companies -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{
  "name": "Acme Corp",
  "ownerEmail": "owner@acmecorp.com"
}'
# → 201 { id, ownerEmail, activationStatus:"pending" }
# Get the token:  docker exec washermann-redis redis-cli --scan --pattern 'company_invite:*'

# 4b. Owner activates — creates/links user, grants COMPANY_OWNER, CompanyAdmin(OWNER),
#     company ACTIVE, emailVerified=true
curl -s -X POST $B/companies/activate -H 'Content-Type: application/json' -d '{
  "inviteToken": "<token-from-redis>",
  "fullName": "Owner Name",
  "password": "OwnerP@ss1",
  "phone": "+2348012345678",
  "industry": "Technology",
  "address": "23 Commerce Drive, Lagos",
  "numberOfWorkers": 120
}'
# → 200 { company(ACTIVE), userId }

# 4c. Owner logs in
curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{
  "identifier": "owner@acmecorp.com", "password": "OwnerP@ss1", "source": "company"
}'
# → 200 tokens (roles now include company_owner)

# 4d. Create a tier (needed to assign employees) — owner/admin token
curl -s -X POST $B/companies/$COMPANY_ID/tiers -H "Authorization: Bearer $OWNER_TOKEN" \
  -H 'Content-Type: application/json' -d '{ "name":"Standard", "pointsPerCycle":1000, "duration":"monthly" }'
```
**Ready when:** company `activationStatus=active`, owner `roles=[user,company_owner]`, has a tier.
Password rule for activation: min 8 + upper + lower + digit + special char.

---

## 5. Vendor (self-registration) — ❌ Not implemented

There is **no public/self-serve vendor registration endpoint**. `POST /vendors` is `ADMIN`-only.
The marketing "Wash Rep / contact" forms only capture leads (`wash_rep_applications`), they do
**not** create vendor accounts. Use flow 6. (If self-serve vendor signup is desired, it needs a
new public endpoint that creates a `PENDING_REVIEW` vendor + invite, mirroring `vendors.create`.)

---

## 6. Vendor (admin-created / invited) — ✅

```bash
# 6a. Admin creates vendor — PENDING_REVIEW vendor + PENDING user [VENDOR] (no password)
#     + invite:{token} (7d) + empty earnings wallet
curl -s -X POST $B/vendors -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{
  "fullName": "Tola Cleaners",
  "email": "vendor@cleaners.com",
  "phone": "+2348023456789",
  "businessName": "Tola Premium Laundry",
  "areaIds": []
}'
# Get token:  docker exec washermann-redis redis-cli --scan --pattern 'invite:*'

# 6b. Vendor sets password (deep-link path works here — value is a plain userId)
curl -s -X POST $B/auth/set-password -H 'Content-Type: application/json' -d '{
  "inviteToken": "<token-from-redis>", "password": "VendorP@ss1"
}'
#   (or token-free: POST /auth/activate {identifier, password})
# → 200 tokens + OTP sent

# 6c. Vendor verifies OTP (flow 1b)

# 6d. Admin verifies the vendor — sets VERIFIED, confirms VENDOR role
curl -s -X POST $B/vendors/$VENDOR_ID/verify -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{ "decision": "verified" }'

# 6e. Vendor proposes pricing → admin approves
curl -s -X POST $B/vendors/me/pricing -H "Authorization: Bearer $VENDOR_TOKEN" \
  -H 'Content-Type: application/json' -d '{ ... price list ... }'
curl -s -X POST $B/vendors/pricing/$PRICING_ID/approve -H "Authorization: Bearer $ADMIN_TOKEN"
```
**Ready when:** vendor `verificationStatus=verified`, password set, pricing approved — then the
vendor can be made available for assignment.

---

## 7. Wash Rep (field logistics agent, `Role.REP`) — ✅

Strictly admin-created. A **temporary password is generated server-side** (not emailed back),
so for testing, set a known password via the reset flow.

```bash
# 7a. Admin creates rep — ACTIVE rep + ACTIVE user [REP] (temp password) + pseudo-wallet
curl -s -X POST $B/reps -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{
  "fullName": "Musa Bello",
  "email": "rep@washermann.com",
  "phone": "+2348034567890",
  "areaIds": [],
  "assignmentPriority": 100
}'

# 7b. Set a known password (rep is ACTIVE, so forgot/reset works)
curl -s -X POST $B/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{ "identifier": "rep@washermann.com" }'
#   read otp:reset:<userId> from Redis, then:
curl -s -X POST $B/auth/reset-password -H 'Content-Type: application/json' -d '{
  "identifier": "rep@washermann.com", "otp": "<reset-otp>", "password": "RepP@ss123"
}'

# 7c. Login, then go available
curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{ "identifier":"rep@washermann.com", "password":"RepP@ss123", "source":"washerman" }'
curl -s -X PATCH $B/reps/me/availability -H "Authorization: Bearer $REP_TOKEN" \
  -H 'Content-Type: application/json' -d '{ "isAvailable": true }'
```
**Ready when:** rep `status=active`, `isAvailable=true`.
> Note: the "Wash Rep application" form on the landing page is a separate **lead** capture
> (`wash_rep_applications`); it does not create a rep account. Admin still creates the rep here.

---

## 8. Admin — ✅

### 8a. First super-admin (one-time)
```bash
curl -s -X POST $B/auth/setup -H 'Content-Type: application/json' -d '{
  "setupSecret": "<ADMIN_SETUP_SECRET from .env>",
  "fullName": "Platform Admin",
  "email": "admin@washermann.com",
  "password": "AdminP@ss1"
}'
# → 201 admin user (ACTIVE, emailVerified=true). Disabled once any admin exists.
curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{ "identifier":"admin@washermann.com", "password":"AdminP@ss1", "source":"admin" }'
```
> The dev seed already creates `admin@washermann.com` on boot (see `SEED_ADMIN_*` in `.env`),
> so you can usually skip 8a and just log in.

### 8b. Additional staff/admins (invited)
```bash
# Create staff — PENDING user with the chosen role + invite:{token} (7d)
curl -s -X POST $B/admin/staff -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' -d '{
  "email": "finance@washermann.com",
  "fullName": "Fin Ops",
  "role": "finance"          // admin | finance | dispute_resolver
}'
# Staff activates: POST /auth/set-password {inviteToken, password}  (or /auth/activate)
# then verify-otp, then login.
```
**Ready when:** staff `status=active` with their role; can call role-gated endpoints.

---

## Shell setup for the curl snippets
```bash
export B=http://localhost:3009/api/v1
# capture tokens from login/register responses, e.g.:
ADMIN_TOKEN=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@washermann.com","password":"AdminP@ss1","source":"admin"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["accessToken"])')
```

---

## Backend gaps to fix (so all 8 flows work cleanly)

1. **Employee invite token mismatch** — store employee invites at `invite:{token}` with a plain
   `userId` (or teach `/auth/set-password` to parse the `company_invite:` JSON). Until then,
   employees activate via `/auth/activate`.
2. **Self-serve company approval missing** — add an admin "approve company" endpoint for
   `awaiting_approval` companies that promotes the contact person to `COMPANY_OWNER`, creates the
   `CompanyAdmin` owner row, and sets the company `ACTIVE`.
3. **No self-serve vendor registration** — add a public vendor signup endpoint if that's a product
   requirement; otherwise document that vendors are admin-onboarded only.
</content>
