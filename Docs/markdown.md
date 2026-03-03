# DAY 7 — Documentation + Lock Scope

## Status: Structural Build Complete

---

# OWNER OVERVIEW

## How Inventory Updates

Inventory changes in three ways:

### 1. Sales Subtract Automatically

- Daily sales reduce ingredient stock.
- Example: 1 sandwich sold → chicken inventory decreases.
- This happens automatically through inventory math.

### 2. Purchases Add Automatically

- When staff log a purchase, inventory increases.
- Example: 5 cases of eggs logged → egg inventory increases.
- No manual recalculation required.

### 3. Manual Adjustments

Used for:

- Breakage
- Spoilage
- Miscounts

Adjustments immediately update the system.

Inventory is calculated, not manually tracked.  
Google Sheets acts as a ledger.  
The application performs all calculations.

---

## How Reorder Works

Each item has:

- **Reorder Point** → Minimum safe quantity
- **Par Level** → Ideal full stock level

When inventory drops below the reorder point:

- The item appears on the **Shopping List**
- The system calculates the quantity needed
- Optional alerts or notifications can trigger

This eliminates guessing and memory-based tracking.

---

## How to Adjust Inventory

Used when:

- Items are damaged
- Items expire
- A count was incorrect

Steps:

1. Open Inventory Adjust
2. Select item
3. Enter quantity change (positive or negative)
4. Save

The system recalculates immediately.

---

## What Calibration Means

Calibration = Teaching the system real-world behavior.

During the first 1–2 weeks:

- Purchases must be logged consistently
- Alerts must be used properly
- Adjustments correct mismatches
- Recipes are validated against actual usage

After calibration:

- Inventory accuracy improves significantly
- Shopping list becomes reliable
- Manual counting reduces
- Alerts become meaningful

Calibration is temporary.  
Accuracy becomes permanent.

---

# STAFF INSTRUCTIONS

## How to Submit an Alert

Use when:

- An item is low
- An item is out
- Something is wrong

Steps:

1. Open alert page or scan QR
2. Enter item + location
3. Submit

Done.

---

## How to Add a Purchase

When new stock arrives:

1. Go to Purchase → Add
2. Select item
3. Enter quantity
4. Save

Inventory increases automatically.

---

## How to Dismiss an Item from the Shopping List

If an item is no longer needed:

1. Open Shopping List
2. Swipe or dismiss item
3. Item hides from active list

History remains intact.

---

# LOCK SCOPE DURING CALIBRATION

To maintain system stability:

## Not Allowed:

- No new features
- No UI redesign
- No route restructuring
- No vendor automation experiments
- No structural changes

## Allowed:

- Bug fixes
- Data corrections
- Stability improvements

This prevents scope creep and protects calibration accuracy.

---

# END OF DAY 7 STATUS

At completion of this documentation:

- Workflow is defined
- Owner understands system logic
- Staff understand procedures
- Scope is locked
- Structural build is complete

System moves from “Building Phase” to “Operational Phase.”

# UPC Lookup Production Hardening

## Why this change

The `/api/upc-lookup` endpoint calls a paid UPC provider (EAN-Search).  
During staging we want to avoid paying for external requests, but in production/testing we want reliable lookups.

We also need to prevent public abuse (anyone hitting the endpoint repeatedly and draining the API token).

## What changed

We updated `app/api/upc-lookup/route.ts` to add:

1. **Auth gating**
   - Allows access only if:
     - Request has `x-api-key` matching `INTERNAL_API_KEY`, OR
     - Request comes from an authenticated Clerk user
   - Prevents token abuse and protects paid quota.

2. **Production toggle**
   - Controlled by `ENABLE_UPC_LOOKUP`
   - When disabled (`false`), endpoint returns `503` with a clear message.
   - Staging/dev can run without a paid UPC token.

3. **Catalog-first shortcut**
   - If the UPC already exists in our `Catalog`, we return the Catalog name immediately.
   - This avoids paid lookups for known items and makes scans faster.

4. **In-memory TTL cache**
   - Repeated scans of the same UPC during a shopping run return from cache.
   - Cache TTL: 7 days (resets on deploy/restart, which is fine).

5. **Raw provider data only in dev**
   - The provider `raw` response is now excluded in production unless explicitly enabled.
   - This reduces payload size and avoids leaking provider data.

## Required environment variables

Production (Render):

- `ENABLE_UPC_LOOKUP=true`
- `UPC_API_KEY=...`
- `UPC_API_BASE_URL=https://api.ean-search.org/api` (optional)
- `INTERNAL_API_KEY=...`
- `GOOGLE_SHEET_ID=...` (already required by sheets logic)

Staging/dev:

- `ENABLE_UPC_LOOKUP=false`
- `UPC_API_KEY` can be blank

Optional debug:

- `DEBUG_UPC_LOOKUP_RAW=true` (only set temporarily if debugging provider response)

## Expected behavior / test checklist

1. **Logged out user** requesting `/api/upc-lookup?upc=...` → `401 Unauthorized`
2. **Logged in Clerk user** → `200 { ok: true, ... }`
3. With `ENABLE_UPC_LOOKUP=false` → `503` (and UI falls back to manual entry)
4. Scan a UPC already in Catalog → response includes `source: "catalog"`
5. Scan the same UPC twice → second response includes `source: "memory_cache"`
