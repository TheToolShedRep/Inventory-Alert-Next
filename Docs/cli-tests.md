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
