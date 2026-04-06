# API Conventions

## Base URL

```
Development:  http://localhost:3000/api/v1
Production:   https://api.washermann.com/api/v1
```

---

## Standard Response Envelope

All responses — success and error — follow a consistent envelope.

### Success
```json
{
  "success": true,
  "data": {},
  "message": "Optional human-readable message"
}
```

### Paginated Success
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

### Error
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": ["Validation error 1", "Validation error 2"],
  "timestamp": "2026-04-06T12:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (validation, invalid input) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Not Found |
| 409 | Conflict (duplicate email, phone, etc.) |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | No token or invalid token |
| `FORBIDDEN` | 403 | Token valid but insufficient role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate resource |
| `VALIDATION_FAILED` | 400 | DTO validation errors |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password |
| `ACCOUNT_SUSPENDED` | 401 | Account suspended |
| `ACCOUNT_PENDING` | 401 | Account not yet activated |
| `TOKEN_EXPIRED` | 401 | JWT has expired |
| `TOKEN_REUSE` | 401 | Refresh token reuse detected |
| `INSUFFICIENT_BALANCE` | 400 | Not enough points |
| `PAYMENT_FAILED` | 400 | Payment source validation failed |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled error |

---

## Authentication

All endpoints are protected by JWT Bearer auth by default.

### Getting a token
```
POST /api/v1/auth/login
{ "identifier": "email_or_phone", "password": "..." }
```

### Using the token
```
Authorization: Bearer <access_token>
```

### Public endpoints (no auth required)
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/check`
- `POST /auth/activate`
- `POST /auth/set-password`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /payments/webhook/paystack`

---

## Pagination

Paginated endpoints accept:
```
?page=1&limit=20
```

Response includes `meta` object with total, page, limit, and pages.

---

## Idempotency

Financial endpoints (wallet funding, order payment) require an `Idempotency-Key` header to prevent duplicate processing:
```
Idempotency-Key: <uuid-v4>
```

---

## Wallet Conversion Security

Wallet credit endpoints require a server-side HMAC signature:
```
X-Washermann-Secret: <hmac-sha256(payload + rotating_secret)>
```

This is validated server-side before any wallet mutation.

---

## Date/Time Format

All timestamps are ISO 8601 UTC:
```
2026-04-06T12:30:00.000Z
```

---

## ID Format

All resource IDs are UUID v4:
```
550e8400-e29b-41d4-a716-446655440000
```
