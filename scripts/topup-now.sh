#!/bin/bash
# One-shot top-up: fresh login → fresh HMAC code → top-up, chained so neither
# the JWT nor the code can expire between steps.
#
# Usage:
#   ./scripts/topup-now.sh <email> <password> [amountNaira]
# e.g.
#   ./scripts/topup-now.sh luomyequa@gmail.com '!Test1234' 50000

set -e
API="${API_URL:-http://localhost:3009}/api/v1"
EMAIL="$1"
PASSWORD="$2"
AMOUNT="${3:-50000}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: ./scripts/topup-now.sh <email> <password> [amountNaira]"
  exit 1
fi

cd "$(dirname "$0")/.."

# Build the login body via env vars (single-quoted python — no shell expansion)
LOGIN_BODY=$(WM_EMAIL="$EMAIL" WM_PW="$PASSWORD" python3 -c 'import json,os; print(json.dumps({"identifier": os.environ["WM_EMAIL"], "password": os.environ["WM_PW"]}))')

# 1. Fresh login
LOGIN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "$LOGIN_BODY")

TOKEN=$(echo "$LOGIN" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["accessToken"])' 2>/dev/null || true)
USERID=$(echo "$LOGIN" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["user"]["id"])' 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
  echo "Login failed:"
  echo "$LOGIN" | python3 -m json.tool
  exit 1
fi
echo "logged in as $EMAIL (userId $USERID)"

# 2. Fresh code (generated milliseconds before the request)
CODE=$(node scripts/topup-code.js "$USERID" 2>/dev/null)

# 3. Top-up
echo "-- POST /wallets/me/topup  (amountNaira=$AMOUNT)"
curl -s -X POST "$API/wallets/me/topup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-WM-Topup-Code: $CODE" \
  -H 'Content-Type: application/json' \
  -d "{\"amountNaira\": $AMOUNT}" | python3 -m json.tool
