#!/bin/bash
# Washermann order-flow e2e smoke (QA recipe).
# Requires: local API on :3009, docker washermann-postgres, test users provisioned
# (rep lc-r-1782449421@t.io, customer lc-c-1782449505@t.io, vendor luomyequa+2@gmail.com — all Test1234!).
# Covers: place (auto-broadcast) → scores → accept signals → garment-log (unpriced avg)
# → delivery chain → on-time counters → state-machine guard → escrow release.
set -e
API=http://localhost:3009/api/v1
AREA=5ece5d8e-f0ac-4701-b761-110bc34941b4
VENDOR=a0994408-d699-4dd5-9474-87ce043b7f8f
REP=92780851-6729-4faa-bd86-e2e7668bb5cc
jqd() { python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d.get('data',d)))"; }
tok() { curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d "{\"identifier\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])"; }

cd /Users/richarduzor/Devs/Washermann/washermann-api
PW=$(grep '^SEED_ADMIN_PASSWORD=' .env | cut -d= -f2-)
ADMIN=$(tok admin@washermann.com "$PW")
CUST=$(tok lc-c-1782449505@t.io 'Test1234!')
REPT=$(tok lc-r-1782449421@t.io 'Test1234!')
VEND=$(tok luomyequa+2@gmail.com 'Test1234!')
echo "tokens: admin=${#ADMIN} cust=${#CUST} rep=${#REPT} vendor=${#VEND}"

ITEM=$(docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT id FROM catalogue_items WHERE slug='tops-t-shirts';" | xargs)
PICKUP=$(python3 -c "from datetime import datetime,timedelta,timezone;print((datetime.now(timezone.utc)+timedelta(hours=2)).isoformat())")

echo "== 1. place order =="
ORDER=$(curl -s -X POST $API/orders -H "Authorization: Bearer $CUST" -H 'Content-Type: application/json' -d "{
 \"flow\":\"wash_iron\",\"selections\":[{\"itemId\":\"$ITEM\",\"qty\":2}],\"areaId\":\"$AREA\",
 \"pickupAddress\":\"12 Test Street, Surulere\",\"scheduledPickupAt\":\"$PICKUP\"}" | jqd)
OID=$(echo $ORDER | python3 -c "import sys,json;print(json.load(sys.stdin)['order']['id'])")
echo "order: $OID"
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT status, delivery_deadline IS NOT NULL AS has_sla FROM orders WHERE id='$OID';"

echo "== 2. AUTO-broadcast on placement — composite scores =="
sleep 2  # placeOrder fires assignment async
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT target_type, round(priority_score::numeric,2), status FROM assignment_broadcasts WHERE order_id='$OID';"

echo "== 3. rep accepts — signals =="
curl -s -o /dev/null -w "rep accept %{http_code}\n" -X POST $API/assignment/orders/$OID/accept/rep -H "Authorization: Bearer $REPT"
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT accept_count, round(avg_accept_latency_sec::numeric,1), last_assigned_at IS NOT NULL FROM reps WHERE id='$REP';"

echo "== 4. vendor accepts — signals =="
curl -s -o /dev/null -w "vendor accept %{http_code}\n" -X POST $API/assignment/orders/$OID/accept/vendor -H "Authorization: Bearer $VEND"
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT accept_count, last_assigned_at IS NOT NULL FROM vendors WHERE id='$VENDOR';"
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT status FROM orders WHERE id='$OID';"

echo "== 5. pickup + garment log (incl UNPRICED 'agbada') =="
curl -s -o /dev/null -w "picked-up %{http_code}\n" -X POST $API/orders/$OID/status/picked-up -H "Authorization: Bearer $REPT"
curl -s -o /dev/null -w "garment-log %{http_code}\n" -X POST $API/orders/$OID/garment-log -H "Authorization: Bearer $REPT" -H 'Content-Type: application/json' -d '{"garmentLog":{"tops-t-shirts":2,"agbada":1}}'
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT unpriced_garment_types, vendor_share_naira_snapshot FROM orders WHERE id='$OID';"

echo "== 6. vendor washes; rep delivers =="
for step in "in-progress $VEND" "ready-for-delivery $VEND" "rep-collected $REPT" "out-for-delivery $REPT" "delivered $REPT"; do
  s=$(echo $step | cut -d' ' -f1); t=$(echo $step | cut -d' ' -f2)
  curl -s -o /dev/null -w "$s %{http_code}\n" -X POST $API/orders/$OID/status/$s -H "Authorization: Bearer $t"
done
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT total_deliveries, on_time_deliveries FROM reps WHERE id='$REP';"

echo "== 7. illegal transition guard (delivered → picked-up should 400) =="
curl -s -X POST $API/orders/$OID/status/picked-up -H "Authorization: Bearer $REPT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('blocked:', d.get('success')==False, '|', d.get('message',''))"

echo "== 8. customer confirms — escrow release =="
curl -s -o /dev/null -w "confirm %{http_code}\n" -X POST $API/orders/$OID/confirm-delivery -H "Authorization: Bearer $CUST"
docker exec washermann-postgres psql -U postgres -d washermann -tc "SELECT o.status, e.status FROM orders o JOIN order_escrows e ON e.order_id=o.id WHERE o.id='$OID';"
