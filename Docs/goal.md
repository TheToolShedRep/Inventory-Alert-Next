# Goal of the Next 7 Days

# By Day 7:

- Inventory math engine complete

- Shopping list stable (manual + computed merge)

- Adjustment ledger exists

- Reorder-check locked

- Daily email stable

- Basic manager UI usable

- System ready for 7-day calibration

# DAY 1 — Shopping_Manual Merge (Critical Stability)

# Objective:

## Manual items persist. No more disappearing test items.

### Tasks:

### Create Shopping_Manual sheet:

- timestamp | upc | product_name | qty_to_order_base_units | note

- Update getShoppingList():

### Read:

- Shopping_List

- Shopping_Manual

- Merge by UPC

- Deduplicate (manual overrides computed)

- Apply hide rules after merge

- Keep response shape identical

## Test:

- Add manual item

- Run reorder-check

- Confirm manual item remains

### End of Day 1: Shopping list stable (Done).

# DAY 2 — Adjustment Ledger (Reality Correction)

# Objective:

## Inventory can be corrected without breaking history.

### Tasks:

## Create Inventory_Adjustments sheet:

- timestamp | upc | qty_adjusted_base_units | reason | actor

## Update inventory math:

OnHand = Purchases - Usage + Adjustments

## Add endpoint:

POST /api/inventory/adjust

### Test:

- Adjust EGG by -3

- Recompute

- Confirm on_hand updates correctly

### End of Day 2: System can correct drift (Done).

# DAY 3 — Lock Reorder-Check Behavior

# Objective:

Reorder-check becomes deterministic and predictable.

### Tasks:

### Ensure reorder-check:

Reads Inventory_On_Hand

Writes ONLY to Shopping_List

Does not touch Shopping_Manual

### Confirm:

No duplicate rows

No header issues

No overwriting manual items

Add safety:

If inventory math missing → fail loudly

### End of Day 3: Reorder engine reliable.(Done)

# DAY 4 — Basic Manager Shopping Page

# Objective:

Remove curl dependency.

## Tasks:

### Create a simple page:

List items

### Show:

product_name

qty_to_order

reorder_point

Buttons:

Dismiss

Purchased

Undo

Calls /api/shopping/action

Refresh list

No styling polish. Just working.

### End of Day 4: Owner can operate without Sheets. (Done)

# DAY 5 — Inventory Overview Page

# Objective:

Owner can see on-hand inventory.

Create page:

Search by UPC

Display:

on_hand

base_unit

reorder_point

par_level

Filter by location (optional)

This builds trust.

### End of Day 5: Owner can see current inventory status. (Done)

# DAY 6 — End-to-End System Test

# Full Simulation:

Enter purchase

Run inventory math

Verify on_hand increases

Simulate sales subtraction

Verify on_hand decreases

Trigger reorder-check

Verify Shopping_List

Dismiss item

Verify hide

Send test email

Reset today

Confirm restoration

Log results.

Fix any breakage.

DAY 6 RESULTS — 2026-02-24

TEST_UPC=EGG
TEST_DATE=2026-02-24

1. Baseline on-hand:
2. After purchase:
3. Inventory math run output:
4. After usage subtraction:
5. Reorder-check output:
6. Shopping list output:
7. Dismiss verified:
8. Undo verified:
9. Email verified:
10. Reset verified:

Breakages / Notes:

-

### End of Day 6: System validated. (Done)

# DAY 7 — Documentation + Lock Scope

# Deliverables:

## One-page Owner Overview:

How inventory updates

How reorder works

How to adjust inventory

What calibration means

Staff Instructions:

How to submit alert

How to add purchase

How to dismiss item

Lock scope:

No new features during calibration

### End of Day 7: Structural Build Complete.

# After Day 7 → Calibration Week

Compare 10 high-volume items daily

Adjust recipes if off

Tune reorder_point

Adjust par levels

No architecture changes

Realistic Time Estimate

If you work 2–3 focused hours per day:

7 days is achievable.

If distracted:

It becomes 10–12 days.

Critical Rule For The Next 7 Days

### No:

Refactors

Performance optimizations

New ideas

Vendor integration

Cosmetic redesign

Finish the core machine.
