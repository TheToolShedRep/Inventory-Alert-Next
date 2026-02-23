# CLI Tests (curl) — Inventory Alert System

These curl commands let us test API routes **without the UI**.
They help isolate whether a bug is:

- routing / file placement (405s)
- auth (401s)
- request shape validation (400s)
- Sheets write logic (200 ok but nothing changes)
- Clerk middleware interfering with local curl

---

## 0) Ground rules / prerequisites

### A) Local server running

```bash
npm run dev
```

### B) INTERNAL_API_KEY available in your shell

Your API routes allow auth in two ways:

- Clerk session (browser)
- Internal key (curl)

Set it in your shell before testing:

```bash
export INTERNAL_API_KEY="your_key_here"
```

Confirm it’s set:

```bash
echo "$INTERNAL_API_KEY"
```

**Why:** If the key is missing or incorrect, you’ll get `401 Unauthorized` even if the route is correct.

---

## 1) Detect basic routing problems (405 / 404)

### A) Hit a route with GET (even if it’s POST-only)

```bash
curl -i "http://localhost:3000/api/shopping/action"
```

Expected:

- If the route exports GET: `200 OK`
- If it’s POST-only: you might get `405 Method Not Allowed`

**Why:** `405` usually means _route exists but doesn’t export that HTTP method_ OR the file is not where Next expects it.

---

## 2) Verify POST request shape (JSON parsing + validation)

### A) POST without auth (expected 401)

```bash
curl -i -X POST "http://localhost:3000/api/shopping/action" \
  -H "Content-Type: application/json" \
  -d '{"upc":"TURKEY_SAUSAGE_PATTY","action":"purchased"}'
```

Expected:

- `401 Unauthorized`

**Why:** Confirms the route is reachable and auth is enforced.

---

## 3) Verify internal-key auth works (the “real” curl path)

### A) POST with internal key (should succeed)

```bash
curl -i -X POST "http://localhost:3000/api/shopping/action" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"upc":"TURKEY_SAUSAGE_PATTY","action":"purchased","note":"test"}'
```

Expected:

- `200 OK`
- body: `{"ok":true}`

**Why:** This confirms:

- route is correct
- internal auth gate works
- route parses JSON
- route writes to Sheets without throwing

---

## 4) Debug response headers (Clerk + middleware signals)

### A) Always use `-i` when debugging auth

```bash
curl -i -X POST "http://localhost:3000/api/shopping/action" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"upc":"TURKEY_SAUSAGE_PATTY","action":"purchased"}'
```

Look for headers like:

- `x-clerk-auth-status: signed-out`
- `x-clerk-auth-reason: dev-browser-missing`

**Why:** Even if you’re signed out, internal key should still pass.
Seeing these headers helps confirm Clerk middleware is present but not necessarily blocking.

---

## 5) “Silent fail” detection (route returns ok but UI didn’t change)

### A) Run action POST (writes Shopping_Actions)

```bash
curl -s -X POST "http://localhost:3000/api/shopping/action" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"upc":"TURKEY_SAUSAGE_PATTY","action":"purchased","note":"test"}'
```

Expected:

- `{"ok":true}`

Then immediately confirm the list hides it by calling the list endpoint:

```bash
curl -s "http://localhost:3000/api/shopping-list" | head -c 400
```

**Why:** This isolates whether the problem is:

- write worked but hide logic didn’t
- hide logic worked but UI didn’t refresh
- list route is missing/broken

---

## 6) Confirm the shopping list endpoint exists + returns rows

### A) Quick check

```bash
curl -i "http://localhost:3000/api/shopping-list"
```

Expected:

- `200 OK`
- JSON includes `rows`

**Why:** If `/manager` is calling this route and it doesn’t exist, your UI will look “stuck” even though actions are being logged.

---

## 7) Confirm “dismiss” hides items too

```bash
curl -s -X POST "http://localhost:3000/api/shopping/action" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"upc":"TURKEY_SAUSAGE_PATTY","action":"dismissed","note":"no longer needed"}'
```

Then:

```bash
curl -s "http://localhost:3000/api/shopping-list" | head -c 400
```

**Why:** Purchased and dismissed should both hide an item from today’s list.

---

## 8) (Optional) Confirm route is failing due to method export (classic 405 case)

If you see:

- `405 Method Not Allowed`
- error message: “No HTTP methods exported…”

It usually means the file is wrong or missing exports.

To confirm:

```bash
curl -i -X POST "http://localhost:3000/api/shopping/action" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{"upc":"X","action":"purchased"}'
```

Expected if broken:

- `405`

**Why:** This is how we caught when the route got renamed or moved to the wrong folder.

---

## 9) Purchase route testing (if needed)

### A) Post a purchase (internal key)

```bash
curl -s -X POST "http://localhost:3000/api/purchase" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTERNAL_API_KEY" \
  -d '{
    "upc":"EGG",
    "productName":"Eggs",
    "qtyPurchased":12,
    "storeVendor":"Walmart",
    "assignedLocation":"Kitchen",
    "totalPrice":0
  }'
```

Expected:

- `{"ok":true}`

**Why:** Confirms the Purchases ledger write works independent of UI.

---

## 10) Common troubleshooting outcomes

### A) 401 Unauthorized

- missing/incorrect `x-api-key`
- env var not loaded in dev shell
- route expects Clerk and you’re not signed in

### B) 405 Method Not Allowed

- route file is misplaced (not under `app/api/.../route.ts`)
- route exports no `POST` method
- route folder name mismatch (`action` vs `actions`)

### C) 200 OK but nothing changes

- appended row went into wrong sheet / wrong columns
- sheet headers mismatch
- UI is reading a different endpoint than you’re testing

---

## 11) Why curl is the “truth serum” for this project

- UI can lie (cached fetch, stale state, wrong route, auth issues)
- curl tells you exactly:
  - status code
  - headers (Clerk/middleware)
  - raw response

- Once curl works, UI fixes are straightforward.

### Debug checkpoints

1. If 404 → file path is wrong.
2. If 405 → method export is missing (GET/POST not exported) or route folder name mismatch.
3. If 500 → log server error; likely Sheets auth/env or parsing.

# normal list (should hide dismissed/purchased)

curl -s "http://localhost:3000/api/shopping-list" | python -m json.tool

# include hidden (should show everything, even dismissed)

curl -s "http://localhost:3000/api/shopping-list?includeHidden=1" | python -m json.tool

# Verify Undo brings it back in default list

curl -s -X POST "http://localhost:3000/api/shopping/action" \
 -H "Content-Type: application/json" \
 -H "x-api-key: $INTERNAL_API_KEY" \
 -d '{"upc":"TURKEY_SAUSAGE_PATTY","action":"undo","note":"undo test"}'

curl -s "http://localhost:3000/api/shopping-list" | python -m json.tool

# Testing email pipeline

BASE="https://www.inventory.alert.cbq.thetoolshed.app"

curl -s -i "$BASE/api/inventory/reorder-email" | head -n 30

# If that endpoint requires the internal key, use

curl -s -i "$BASE/api/inventory/reorder-email" \
 -H "x-api-key: $INTERNAL_API_KEY" | head -n 60

# Validate email content matches the list

curl -s "$BASE/api/shopping-list" | python -m json.tool

# If the endpoint doesn’t exist / 404

curl -s -i "$BASE/api/inventory/reorder-check" | head -n 30
curl -s -i "$BASE/api/inventory/reorder-email" | head -n 30

# Test reorder without internal key (security check)

curl -s -i "$BASE/api/inventory/reorder-email" | head -n 60

# Test with internal key

curl -s -i "$BASE/api/inventory/reorder-email" \
 -H "x-api-key: $INTERNAL_API_KEY" | head -n 60

# Test the Dismiss function

curl -s -X POST "$BASE/api/shopping/action" \
 -H "Content-Type: application/json" \
 -H "x-api-key: $INTERNAL_API_KEY" \
 -d '{"upc":"EGG","action":"dismissed","note":"email test"}' | python -m json.tool

# Test email shopping list alert's pipeline

curl -s "$BASE/api/inventory/reorder-email" \
 -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

# Test the Undo Shopping List funtion

curl -s -X POST "$BASE/api/shopping/action" \
 -H "Content-Type: application/json" \
 -H "x-api-key: $INTERNAL_API_KEY" \
 -d '{"upc":"EGG","action":"undo","note":"email test"}' | python -m json.tool

# Test spam prevention

curl -s "$BASE/api/inventory/reorder-email" -H "x-api-key: $INTERNAL_API_KEY"

# bypass daily lock only

curl -s "$BASE/api/inventory/reorder-email?force=1" -H "x-api-key: $INTERNAL_API_KEY"

# bypass daily lock + cooldown (use sparingly)

curl -s "$BASE/api/inventory/reorder-email?force=2" -H "x-api-key: $INTERNAL_API_KEY"

# test in production

curl -s "$BASE/api/inventory/reorder-email" \
 -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

curl -s "$BASE/api/inventory/reorder-email" \
 -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

# What we expect after deploy

{
"ok": true,
"scope": "reorder-email",
"businessDate": "...",
"emailed_to": 7,
"items": 5,
"request_id": "...",
"items_hash": "...",
...
}

# Second call (immediately after)

{
"ok": true,
"scope": "reorder-email",
"skipped": true,
"reason": "cooldown",
...
}

BASE="https://www.inventory.alert.cbq.thetoolshed.app"

# 1) Normal email (respects hide rules)

curl -s "$BASE/api/inventory/reorder-email" -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

# 2) Test email (shows full list even if items were dismissed)

curl -s "$BASE/api/inventory/reorder-email?test=1&force=2" -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

# 3) See what would be reset (no writes)

curl -s "$BASE/api/shopping/reset-today?dryRun=1" -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

# 4) Reset hidden items for today (writes undo actions)

curl -s "$BASE/api/shopping/reset-today" -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

# 5) Confirm list is back

curl -s "$BASE/api/shopping-list" | python -m json.tool

# Final testing phase

1️⃣ Dismiss CROISSANT
curl -s -X POST "$BASE/api/shopping/action" \
 -H "Content-Type: application/json" \
 -H "x-api-key: $INTERNAL_API_KEY" \
 -d '{"upc":"CROISSANT","action":"dismissed","note":"live test"}'

2️⃣ Confirm it disappears
curl -s "$BASE/api/shopping-list" | python -m json.tool

3️⃣ Send normal email
curl -s "$BASE/api/inventory/reorder-email?force=2" \
 -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

Should show items: 2

4️⃣ Send test email
curl -s "$BASE/api/inventory/reorder-email?test=1&force=2" \
 -H "x-api-key: $INTERNAL_API_KEY" | python -m json.tool

# $Base was enpty during testing

## confirm your env vars are set

echo "BASE=$BASE"
echo "INTERNAL_API_KEY=${INTERNAL_API_KEY:0:6}..."

### current results

$ echo "BASE=$BASE"
BASE=

$ echo "INTERNAL_API_KEY=${INTERNAL_API_KEY:0:6}..."
INTERNAL_API_KEY=...

## If BASE= prints blank → that’s the whole issue.

Set it (use your prod domain):

export BASE="https://www.inventory.alert.cbq.thetoolshed.app"

## This prints status + headers so we can see if it’s 200/401/502/HTML:

curl -i "$BASE/api/shopping-list" | head -n 40

### results

$ curl -i "$BASE/api/shopping-list" | head -n 40
curl: (3) URL rejected: Malformed input to a URL function

## Re-run JSON commands and results

$ curl -sS -X POST "$BASE/api/shopping/action" \

> -H "Content-Type: application/json" \
>  -H "x-api-key: $INTERNAL_API_KEY" \
>  -d '{"upc":"CROISSANT","action":"dismissed","note":"manual lane test"}' \
>  | python -m json.tool
> 6ea74curl: (3) URL rejected: Malformed input to a URL function
> Expecting value: line 1 column 1 (char 0)

$ curl -sS -X POST "$BASE/api/shopping/action" \

> -H "Content-Type: application/json" \
>  -H "x-api-key: $INTERNAL_API_KEY" \
>  -d '{"upc":"CROISSANT","action":"dismissed","note":"manual lane test"}' \
>  | python -m json.tool
> 6ea74curl: (3) URL rejected: Malformed input to a URL function
> Expecting value: line 1 column 1 (char 0)

# What’s happening

BASE= is empty, so curl is literally trying to request "/api/shopping-list" (not a valid absolute URL).

That’s why I get: curl: (3) URL rejected: Malformed input…

Also: INTERNAL_API_KEY=... means the variable is either empty or not set in this terminal session (Git Bash shows ... when the substring is empty).

So the system isn’t broken — your terminal session lost the env vars after outage.

## The fix

$ export INTERNAL_API_KEY="MY_INTERNAL_KEY"
$ echo "BASE=$BASE" 
$ echo "INTERNAL_API_KEY=${INTERNAL_API_KEY:0:6}..." (printed first 6 digits of my key)

### Results

The shopping list call were successful

## Preventive measures

Create a file called scripts/env.sh

export BASE="https://www.inventory.alert.cbq.thetoolshed.app"
export INTERNAL_API_KEY="MY_INTERNAL_KEY"

#### Now, whenever there's an outage or a need for a new terminal I can source:

source scripts/env.sh

# Break Fix

### Break

I noticed the there was an item missing from the manual shopping list. The item was hidden by the current list

### Fix

I ran a curl command:

ran: $curl -sS "$BASE/api/shopping-list?includeHidden=1" | python -m json.tool

#### Results

````$ curl -sS "$BASE/api/shopping-list?includeHidden=1" | python -m json.tool
{
 "ok": true,
"scope": "shopping-list",
"businessDate": "2026-02-22",
"includeHidden": true,
"ms": 441,
"count": 3,
"rows": [
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "CROISSANT",
"product_name": "Croissant",
"qty_to_order_base_units": "4",
"note": ""
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "CROISSANT",
"product_name": "Croissant",
"qty_to_order_base_units": "4",
"note": ""
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"upc": "CROISSANT",
"product_name": "Croissant",
"qty_to_order_base_units": "4",
"note": ""
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"product_name": "Croissant",
"qty_to_order_base_units": "4",
"note": ""
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"qty_to_order_base_units": "4",
"note": ""
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"note": ""
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"product_name": "egg",
"qty_to_order_base_units": "2",
"note": ""
},
{
"note": ""
},
{
"timestamp": "2026-02-22T11:15:57.501Z",
"upc": "TURKEY_SAUSAGE_PATTY",
{
"timestamp": "2026-02-22T11:15:57.501Z",
"upc": "TURKEY_SAUSAGE_PATTY",
"timestamp": "2026-02-22T11:15:57.501Z",
"upc": "TURKEY_SAUSAGE_PATTY",
"product_name": "Turkey Sausage Patty",
"on_hand_base_units": "39",
"upc": "TURKEY_SAUSAGE_PATTY",
"product_name": "Turkey Sausage Patty",
"on_hand_base_units": "39",
"product_name": "Turkey Sausage Patty",
"on_hand_base_units": "39",
"on_hand_base_units": "39",
"base_unit": "each",
"base_unit": "each",
"reorder_point": "40",
"par_level": "",
"qty_to_order_base_units": "1",
"preferred_vendor": "",
"default_location": "",
"note": ""
}
]
}```

#### Bring item to same day list

```curl -sS -X POST "$BASE/api/shopping/action" \
 -H "Content-Type: application/json" \
 -H "x-api-key: $INTERNAL_API_KEY" \
 -d '{"upc":"CROISSANT","action":"undo","note":"bring back today"}' \
| python -m json.tool

curl -sS "$BASE/api/shopping-list" | python -m json.tool```

#### Why did the list have duplicates

The copy from other site and docs became currupted

```$ curl -sS "$BASE/api/shopping-list?includeHidden=1" -o /tmp/out.json && python -m json.tool /tmp/out.json >
/tmp/pretty.json && wc -c /tmp/out.json && head -n 80 /tmp/pretty.json
625 /tmp/out.json
{
"ok": true,
"scope": "shopping-list",
"businessDate": "2026-02-22",
"includeHidden": true,
"ms": 254,
"count": 3,
"rows": [
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "CROISSANT",
"product_name": "Croissant",
"qty_to_order_base_units": "4",
"note": ""
},
{
"timestamp": "2026-02-21T17:26:54.961Z",
"upc": "EGG",
"product_name": "egg",
"qty_to_order_base_units": "2",
"note": ""
},
{
"timestamp": "2026-02-22T11:15:57.501Z",
"upc": "TURKEY_SAUSAGE_PATTY",
"product_name": "Turkey Sausage Patty",
"on_hand_base_units": "39",
"base_unit": "each",
"reorder_point": "40",
"par_level": "",
"qty_to_order_base_units": "1",
"preferred_vendor": "",
"default_location": "",
"note": ""
}
]
}```

#### this confirs it was coyp/paste noise

# Testing after adding adjustment logic

## Check current on-hand

```curl -sS "$BASE/api/inventory/on-hand?upc=EGG" | python -m json.tool
{
"ok": true,
"scope": "inventory-on-hand",
"upc": "EGG",
"base_unit": "each",
"purchased_base_units": 180,
"used_base_units": 56,
"adjustment_base_units": -3,
"on_hand_base_units": 121,
"ms": 1556
}```

## Post adjustment

```curl -sS -X POST "$BASE/api/inventory/adjust" \
 -H "content-type: application/json" \
 -H "x-api-key: $INTERNAL_API_KEY" \
 -d '{"upc":"EGG","base_units_delta":-3,"adjustment_type":"count","reason":"count correction","actor":"tommy"}' \
| python -m json.tool

.tool;42b87c52-3e7f-44b1-a0d1-1f8b1c46ea74bash: url: command not found
Expecting value: line 1 column 1 (char 0)```

## Re-check on-hand

```curl -sS "$BASE/api/inventory/on-hand?upc=EGG" | python -m json.tool

$ curl -sS "$BASE/api/inventory/on-hand?upc=EGG" | python -m json.tool
{
"ok": true,
"scope": "inventory-on-hand",
"upc": "EGG",
"base_unit": "each",
"purchased_base_units": 180,
"used_base_units": 56,
"adjustment_base_units": -3,
"on_hand_base_units": 121,
"ms": 870
}```

### the on-hand math is wired correctly

first call proves it:

- purchased = 180

- used = 56

- adjustments = -3

on_hand = 180 − 56 − 3 = 121 (done)

## Why the POST failed

This part is just Git Bash paste/formatting

### Fix

```API_KEY" -d "{\"upc\":\"EGG\",\"base_units_delta\":-3,\"adjustment_type\":\"count\",\"reason\":\"count correction\",\"actor\":\"tommy\"}" | python -m json.tool
:\\"tommy\\"}" | python -m json.tool;42b87c52-3e7f-44b1-a0d1-1f8b1c46ea74{
"ok": true,
"scope": "inventory-adjust",
"upc": "EGG",
"base_units_delta": -3,
"date": "(default business date)"
}

$ curl -sS "$BASE/api/inventory/on-hand?upc=EGG" | python -m json.tool
{
"ok": true,
"scope": "inventory-on-hand",
"upc": "EGG",
"base_unit": "each",
"purchased_base_units": 180,
"used_base_units": 56,
"adjustment_base_units": -6,
"on_hand_base_units": 118,
"ms": 985
}```
````
