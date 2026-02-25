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
