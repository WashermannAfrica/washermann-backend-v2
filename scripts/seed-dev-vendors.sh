#!/usr/bin/env bash
#
# seed-dev-vendors.sh — stand up a fully testable Washermann DEV/STAGING environment,
# distributed across areas:
#   • For each active area in a state (default Lagos) that has a geofenced location:
#       - VENDORS_PER_AREA vendors (registered → verified → assigned to that area
#         (area_ids) + located + priced across the catalogue + available)
#       - REPS_PER_AREA reps (created & assigned to that area; made available+loggable
#         via an optional DB finalize)
#   • 1 funded test customer at the first area's location.
#
# Vendor↔area matching uses the vendor's area_ids (jsonb), so each vendor is assigned
# to its area via PATCH /vendors/me/profile { areaIds, latitude, longitude, isAvailable }.
#
# Requirements: bash, curl, jq   (+ psql & node if you pass REP_DB_URL)
#
# Usage:
#   BASE=https://dev-api.washermann.com/api/v1 \
#   ADMIN_EMAIL=... ADMIN_PASSWORD='...' \
#   STATE=Lagos VENDORS_PER_AREA=5 REPS_PER_AREA=3 MAX_AREAS=0 \
#   REP_DB_URL='postgresql://user:pass@host:port/railway'   # optional, to auto-finalize reps \
#   bash scripts/seed-dev-vendors.sh
#
# Optional: ITEM_LIMIT (catalogue items to price, default 60),
#           VENDOR_PASSWORD / REP_PASSWORD / CUSTOMER_PASSWORD (default Passw0rd!),
#           CREDIT_WP (default 50000), MAX_AREAS (0 = all matching), FORCE=1.
#
set -uo pipefail

BASE="${BASE:-https://dev-api.washermann.com/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:?set ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?set ADMIN_PASSWORD}"
STATE="${STATE:-Lagos}"
VENDORS_PER_AREA="${VENDORS_PER_AREA:-5}"
REPS_PER_AREA="${REPS_PER_AREA:-3}"
MAX_AREAS="${MAX_AREAS:-0}"
ITEM_LIMIT="${ITEM_LIMIT:-60}"
VENDOR_PASSWORD="${VENDOR_PASSWORD:-Passw0rd!}"
REP_PASSWORD="${REP_PASSWORD:-Passw0rd!}"
CUSTOMER_PASSWORD="${CUSTOMER_PASSWORD:-Passw0rd!}"
CREDIT_WP="${CREDIT_WP:-50000}"
REP_DB_URL="${REP_DB_URL:-}"
STAMP="$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

command -v jq >/dev/null || { echo "❌ jq is required (brew install jq)"; exit 1; }
if [[ "$BASE" != *dev* && "$BASE" != *staging* && "$BASE" != *localhost* && "${FORCE:-0}" != "1" ]]; then
  echo "❌ BASE does not look like dev/staging ($BASE). Re-run with FORCE=1 if sure."; exit 1
fi

say(){ printf "\n\033[1;36m%s\033[0m\n" "$*"; }
sub(){ printf "\033[1;35m%s\033[0m\n" "$*"; }
ok(){ printf "    \033[32m✓\033[0m %s\n" "$*"; }
warn(){ printf "    \033[33m⚠ %s\033[0m\n" "$*"; }
die(){ printf "    \033[31m✗ %s\033[0m\n" "$*"; echo "${2:-}" | jq . 2>/dev/null || echo "${2:-}"; exit 1; }

api(){ # METHOD PATH TOKEN [JSON]
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local args=(-s -X "$method" "$BASE$path" -H 'Content-Type: application/json' -H 'X-Client-App: mobile')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$body"  ]] && args+=(-d "$body")
  curl "${args[@]}"
}

# unique, valid phone per account. Must run in the PARENT shell (printf -v, no $( ))
# so $RANDOM advances each call — inside $( ) every subshell re-uses the same seed.
PHONE_OUT=""
nextphone(){ printf -v PHONE_OUT '+234%09d' "$(( (RANDOM * 32768 + RANDOM) % 900000000 + 100000000 ))"; }

# ─── 1. Admin login ───────────────────────────────────────────────────────────
say "1. Logging in as admin ($ADMIN_EMAIL)"
RES="$(api POST /auth/login "" "$(jq -nc --arg i "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{identifier:$i,password:$p}')")"
ADMIN_TOKEN="$(echo "$RES" | jq -r '.data.accessToken // empty')"
[[ -n "$ADMIN_TOKEN" ]] || die "admin login failed" "$RES"
ok "admin token acquired"

# ─── 2. Build target areas (active, in STATE, with a geofenced location) ────────
say "2. Selecting target areas in $STATE (one geofenced location each)"
AREAS="$(api GET "/areas?limit=200" "$ADMIN_TOKEN")"
TARGETS="$(echo "$AREAS" | jq -c --arg st "$STATE" '
  [ (.data.items? // .data // [])[]
    | select(.isActive != false)
    | select((.state // "" | ascii_downcase) == ($st | ascii_downcase))
    | . as $a
    | ([ (.locations // [])[] | select(.centerLat != null and .centerLng != null and (.isActive != false)) ][0]) as $loc
    | select($loc != null)
    | {areaId:$a.id, areaName:$a.name, locName:$loc.name, lat:$loc.centerLat, lng:$loc.centerLng} ]' 2>/dev/null)"
[[ -n "$TARGETS" && "$TARGETS" != "[]" ]] || die "no active $STATE area has a geofenced location" "$AREAS"
if [[ "$MAX_AREAS" -gt 0 ]]; then TARGETS="$(echo "$TARGETS" | jq -c --argjson n "$MAX_AREAS" '.[0:$n]')"; fi
AREA_N="$(echo "$TARGETS" | jq 'length')"
ok "$AREA_N area(s): $(echo "$TARGETS" | jq -r '[.[].areaName] | join(", ")')"

# ─── 3. Active conversion rate ─────────────────────────────────────────────────
say "3. Checking active NGN conversion rate"
api GET "/conversion-rates/active?currency=NGN" "$ADMIN_TOKEN" | jq -e '.success == true' >/dev/null 2>&1 \
  && ok "active conversion rate present" || warn "No active NGN conversion rate — orders won't price until one is set."

# ─── 4. Catalogue items to price (as many as ITEM_LIMIT, valid price enforced) ──
say "4. Loading catalogue items to price (up to $ITEM_LIMIT)"
ITEMS="$(api GET /catalogue/items "$ADMIN_TOKEN")"
PRICING_ITEMS="$(echo "$ITEMS" | jq -c --argjson lim "$ITEM_LIMIT" '
  [ (.data.items? // .data // [])[]
    | select(.id != null and (.isActive != false) and (.isAvailable != false))
    | {itemId:.id, garmentType:(.name // "Item"),
       priceNaira:(((.priceNgn // 0) | tonumber? // 0) as $p | (if $p >= 1 then $p else 700 end) | floor)} ]
  | .[0:$lim]' 2>/dev/null)"
ITEM_COUNT="$(echo "$PRICING_ITEMS" | jq 'length' 2>/dev/null || echo 0)"
[[ "$ITEM_COUNT" -gt 0 ]] || die "no catalogue items found — seed the catalogue first" "$ITEMS"
FIRST_ITEM_ID="$(echo "$PRICING_ITEMS" | jq -r '.[0].itemId')"
ok "pricing $ITEM_COUNT catalogue item(s) per vendor"

# ─── 5. Per-area: create vendors + reps ────────────────────────────────────────
VENDORS="[]"; REPS_JSON="[]"; REP_UIDS=(); REP_IDS=()
C_AREA_ID=""; C_LAT=""; C_LNG=""; C_LOC=""

while read -r T; do
  [[ -z "$T" ]] && continue
  AID="$(echo "$T" | jq -r '.areaId')"; ANAME="$(echo "$T" | jq -r '.areaName')"
  LAT="$(echo "$T" | jq -r '.lat')"; LNG="$(echo "$T" | jq -r '.lng')"; LOC="$(echo "$T" | jq -r '.locName')"
  [[ -z "$C_AREA_ID" ]] && { C_AREA_ID="$AID"; C_LAT="$LAT"; C_LNG="$LNG"; C_LOC="$LOC"; }
  say "► Area: $ANAME  ($LOC @ $LAT,$LNG)"

  for v in $(seq 1 "$VENDORS_PER_AREA"); do
    EMAIL="vendor+seed${STAMP}_${AID:0:4}_${v}@dev.washermann.com"; nextphone; PHONE="$PHONE_OUT"
    sub "  vendor $v/$VENDORS_PER_AREA — $EMAIL"
    VTOKEN=""
    for attempt in $(seq 1 8); do
      R="$(api POST /auth/vendor/register "" "$(jq -nc --arg f "Vendor $ANAME $v" --arg e "$EMAIL" --arg p "$PHONE" --arg pw "$VENDOR_PASSWORD" '{fullName:$f,email:$e,phone:$p,password:$pw}')")"
      if echo "$R" | jq -e '.success == true' >/dev/null 2>&1; then VTOKEN="$(echo "$R" | jq -r '.data.accessToken // empty')"; break; fi
      MSG="$(echo "$R" | jq -r '(.message | if type=="array" then join("; ") else . end) // .error // ""')"
      if echo "$MSG" | grep -qiE 'conflict|already exists|phone|email'; then
        nextphone; PHONE="$PHONE_OUT"; EMAIL="${EMAIL%@*}+r${attempt}@${EMAIL#*@}"; warn "conflict — retrying with phone $PHONE"; continue
      fi
      die "vendor register failed" "$R"
    done
    [[ -n "$VTOKEN" ]] || die "vendor register failed after retries" "$R"
    VID="$(api GET /vendors/me/profile "$VTOKEN" | jq -r '.data.id // .data.vendor.id // empty')"
    [[ -n "$VID" ]] || die "could not read vendor profile id" ""
    ok "registered ($VID)"
    api POST "/vendors/$VID/verify" "$ADMIN_TOKEN" '{"decision":"verified"}' | jq -e '.success != false' >/dev/null 2>&1 && ok "verified" || die "verify failed"
    # assign to area (area_ids) + shop location + go available — one call
    api PATCH /vendors/me/profile "$VTOKEN" "$(jq -nc --arg a "$AID" --argjson la "$LAT" --argjson ln "$LNG" '{areaIds:[$a],latitude:$la,longitude:$ln,isAvailable:true}')" \
      | jq -e '.success != false' >/dev/null 2>&1 && ok "assigned to area + located + available" || die "assign/area failed"
    R="$(api POST /vendors/me/pricing "$VTOKEN" "$(jq -nc --argjson items "$PRICING_ITEMS" '{items:$items}')")"
    PID="$(echo "$R" | jq -r '.data.id // empty')"; [[ -n "$PID" ]] || die "propose pricing failed" "$R"
    api POST "/vendors/pricing/$PID/approve" "$ADMIN_TOKEN" '{}' | jq -e '.success != false' >/dev/null 2>&1 && ok "priced ($ITEM_COUNT items) + approved" || die "approve pricing failed"
    VENDORS="$(echo "$VENDORS" | jq -c --arg id "$VID" --arg e "$EMAIL" --arg ar "$ANAME" '. + [{vendorId:$id,email:$e,area:$ar}]')"
  done

  for r in $(seq 1 "$REPS_PER_AREA"); do
    EMAIL="rep+seed${STAMP}_${AID:0:4}_${r}@dev.washermann.com"; nextphone; PHONE="$PHONE_OUT"
    sub "  rep $r/$REPS_PER_AREA — $EMAIL"
    RID=""
    for attempt in $(seq 1 8); do
      R="$(api POST /reps "$ADMIN_TOKEN" "$(jq -nc --arg f "Rep $ANAME $r" --arg e "$EMAIL" --arg p "$PHONE" --arg a "$AID" --argjson pr "$r" '{fullName:$f,email:$e,phone:$p,areaIds:[$a],assignmentPriority:$pr}')")"
      RID="$(echo "$R" | jq -r '.data.id // .data.rep.id // empty')"
      [[ -n "$RID" ]] && break
      MSG="$(echo "$R" | jq -r '(.message | if type=="array" then join("; ") else . end) // .error // ""')"
      if echo "$MSG" | grep -qiE 'conflict|already exists|phone|email'; then
        nextphone; PHONE="$PHONE_OUT"; EMAIL="${EMAIL%@*}+r${attempt}@${EMAIL#*@}"; warn "conflict — retrying rep with phone $PHONE"; continue
      fi
      die "rep create failed" "$R"
    done
    [[ -n "$RID" ]] || die "rep create failed after retries" "$R"
    RUID="$(echo "$R" | jq -r '.data.userId // .data.user.id // empty')"
    [[ -z "$RUID" ]] && RUID="$(api GET "/reps/$RID" "$ADMIN_TOKEN" | jq -r '.data.userId // .data.user.id // empty')"
    ok "created ($RID)"
    REP_IDS+=("$RID"); REP_UIDS+=("$RUID")
    REPS_JSON="$(echo "$REPS_JSON" | jq -c --arg id "$RID" --arg uid "$RUID" --arg e "$EMAIL" --arg ar "$ANAME" '. + [{repId:$id,userId:$uid,email:$e,area:$ar}]')"
  done
done < <(echo "$TARGETS" | jq -c '.[]')

# ─── 6. Finalize reps (password + availability) via optional DB step ───────────
REP_FINALIZED="no"
if [[ ${#REP_IDS[@]} -gt 0 ]]; then
  if [[ -n "$REP_DB_URL" ]] && command -v psql >/dev/null && command -v node >/dev/null; then
    say "6. Finalizing ${#REP_IDS[@]} reps (password + availability in DB)"
    HASH="$(cd "$API_DIR" && node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" "$REP_PASSWORD" 2>/dev/null)"
    if [[ -z "$HASH" ]]; then warn "could not generate bcrypt hash (bcryptjs in $API_DIR?) — skipping"; else
      UIDS="$(printf "'%s'," "${REP_UIDS[@]}")"; UIDS="${UIDS%,}"
      RIDS="$(printf "'%s'," "${REP_IDS[@]}")"; RIDS="${RIDS%,}"
      if psql "$REP_DB_URL" -v ON_ERROR_STOP=1 \
           -c "UPDATE users SET password_hash='$HASH', status='active', email_verified=true WHERE id IN ($UIDS);" \
           -c "UPDATE reps SET is_available=true WHERE id IN ($RIDS);" >/dev/null 2>&1; then
        REP_FINALIZED="yes"; ok "reps available & loggable (password: $REP_PASSWORD)"
      else warn "DB finalize failed — check REP_DB_URL; manual SQL printed below"; fi
    fi
  else
    say "6. Reps created (not yet available — no REP_DB_URL / psql / node)"
  fi
fi

# ─── 7. Funded test customer (at the first area) ───────────────────────────────
CUST_EMAIL="customer+seed${STAMP}@dev.washermann.com"; nextphone; CUST_PHONE="$PHONE_OUT"
say "7. Creating funded test customer $CUST_EMAIL"
CTOKEN=""; CUID=""
for attempt in $(seq 1 8); do
  R="$(api POST /auth/register "" "$(jq -nc --arg e "$CUST_EMAIL" --arg p "$CUST_PHONE" --arg pw "$CUSTOMER_PASSWORD" '{fullName:"Seed Customer",email:$e,phone:$p,password:$pw}')")"
  CTOKEN="$(echo "$R" | jq -r '.data.accessToken // empty')"; CUID="$(echo "$R" | jq -r '.data.user.id // empty')"
  [[ -n "$CTOKEN" && -n "$CUID" ]] && break
  MSG="$(echo "$R" | jq -r '(.message | if type=="array" then join("; ") else . end) // .error // ""')"
  if echo "$MSG" | grep -qiE 'conflict|already exists|phone|email'; then
    nextphone; CUST_PHONE="$PHONE_OUT"; CUST_EMAIL="${CUST_EMAIL%@*}+r${attempt}@${CUST_EMAIL#*@}"; warn "conflict — retrying customer with phone $CUST_PHONE"; continue
  fi
  die "customer register failed" "$R"
done
[[ -n "$CTOKEN" && -n "$CUID" ]] || die "customer register failed after retries" "$R"; ok "created ($CUID)"
api POST /users/me/addresses "$CTOKEN" "$(jq -nc --arg a "$C_LOC (seed)" --argjson la "$C_LAT" --argjson ln "$C_LNG" '{addressText:$a,latitude:$la,longitude:$ln,isDefault:true}')" | jq -e '.success != false' >/dev/null 2>&1 && ok "address added" || warn "address add failed"
api POST "/wallets/$CUID/credit" "$ADMIN_TOKEN" "$(jq -nc --argjson amt "$CREDIT_WP" '{amount:$amt,description:"dev seed funding"}')" | jq -e '.success != false' >/dev/null 2>&1 && ok "wallet credited $CREDIT_WP WP" || warn "wallet credit failed"

# ─── Summary ───────────────────────────────────────────────────────────────────
say "✅ Done"
echo
echo "  Base URL        : $BASE"
echo "  Areas seeded    : $AREA_N"
echo "  Vendors created : $(echo "$VENDORS" | jq 'length')   (password: $VENDOR_PASSWORD)"
echo "  Reps created    : $(echo "$REPS_JSON" | jq 'length')   (password: $REP_PASSWORD, available=$REP_FINALIZED)"
echo "  Items priced    : $ITEM_COUNT per vendor"
echo
echo "  Vendors by area:"
echo "$VENDORS" | jq -r 'group_by(.area)[] | "    ■ \(.[0].area):\n" + ( map("        • \(.email)  (\(.vendorId))") | join("\n") )'
echo
echo "  Reps by area:"
echo "$REPS_JSON" | jq -r 'group_by(.area)[] | "    ■ \(.[0].area):\n" + ( map("        • \(.email)  rep=\(.repId) user=\(.userId)") | join("\n") )'
echo
echo "  Customer  : $CUST_EMAIL   password: $CUSTOMER_PASSWORD   (wallet $CREDIT_WP WP)"
echo "  Order test: pickup latitude=$C_LAT longitude=$C_LNG (area $C_AREA_ID — \"$C_LOC\")"
echo "    POST /orders { \"flow\":\"wash_iron\", \"selections\":[{\"itemId\":\"$FIRST_ITEM_ID\",\"qty\":3}],"
echo "                  \"allocationMode\":\"automatic\", \"pickupAddress\":\"$C_LOC\","
echo "                  \"pickupLatitude\":$C_LAT, \"pickupLongitude\":$C_LNG,"
echo "                  \"scheduledPickupAt\":\"$(date -u -v+1d +%Y-%m-%dT09:00:00Z 2>/dev/null || date -u -d '+1 day' +%Y-%m-%dT09:00:00Z)\" }"
echo "    POST /orders/:id/confirm-payment"

if [[ ${#REP_IDS[@]} -gt 0 && "$REP_FINALIZED" != "yes" ]]; then
  HASH_HINT="$(cd "$API_DIR" && node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" "$REP_PASSWORD" 2>/dev/null)"
  UIDS="$(printf "'%s'," "${REP_UIDS[@]}")"; UIDS="${UIDS%,}"
  RIDS="$(printf "'%s'," "${REP_IDS[@]}")"; RIDS="${RIDS%,}"
  echo
  echo "  ⚠ Reps not yet available — run this once on the dev DB (password becomes '$REP_PASSWORD'):"
  echo "    UPDATE users SET password_hash='${HASH_HINT:-<bcrypt-hash>}', status='active', email_verified=true WHERE id IN ($UIDS);"
  echo "    UPDATE reps  SET is_available=true WHERE id IN ($RIDS);"
  echo "    (or re-run with REP_DB_URL set on the same command.)"
fi
