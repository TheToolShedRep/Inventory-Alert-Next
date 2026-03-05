# Barcode & Ingredient UPC Architecture Update

## Overview

This update introduces a **two-layer UPC system** to support reliable barcode scanning while keeping the internal inventory system stable and consistent.

The system now distinguishes between:

1. **ingredient_upc** (canonical internal identifier)
2. **barcode_upc** (external barcode scanned by devices)

This change prevents real-world barcode inconsistencies from breaking the inventory, recipes, or purchasing logic.

---

# Why This Change Was Needed

Previously the system treated **all UPC values the same**.

This caused multiple problems:

### 1. Real Barcodes Are Not Stable

A single ingredient can have many barcodes depending on:

- vendor
- package size
- brand
- distributor

Example:

| Product    | Barcode      |
| ---------- | ------------ |
| Bacon 12oz | 070662030321 |
| Bacon 16oz | 070662030338 |
| Bacon bulk | 021130000000 |

All represent **BACON**, but the system would treat them as different items.

---

### 2. Recipes Need Stable Ingredient IDs

Recipes should reference ingredients like:

PORK_BACON_SLICE
EGG
MILK_WHOLE

Not vendor barcodes.

If recipes used barcodes, every vendor change would break recipes.

---

### 3. Barcode APIs Are Incomplete

Barcode APIs frequently fail to recognize items.

Examples:

local distributor barcodes
private label products
store packed items

The system must work even when barcode APIs fail.

---

# New Architecture

The system now separates identifiers into two layers.

SCAN → barcode_upc
│
▼
Barcode_Map
│
▼
ingredient_upc
│
▼
Catalog / Recipes / Inventory

---

# Ingredient UPC (Canonical Key)

`ingredient_upc` is the **internal stable identifier**.

Examples:

EGG
PORK_BACON_SLICE
MILK_WHOLE
CROISSANT

These keys are used everywhere internally:

- Recipes
- Inventory
- Shopping lists
- Reorder logic
- Alerts

They **never change**.

---

# Barcode UPC (Scanned Value)

`barcode_upc` is the value returned from the scanner.

Example:

070662030321
070662030338
021130000000

These values are mapped to ingredient UPCs.

---

# New Sheet: `Barcode_Map`

A new sheet maps scanned barcodes to ingredients.

Example:

| barcode_upc  | ingredient_upc   | active |
| ------------ | ---------------- | ------ |
| 070662030321 | PORK_BACON_SLICE | TRUE   |
| 070662030338 | PORK_BACON_SLICE | TRUE   |
| 021130000000 | PORK_BACON_SLICE | TRUE   |

Benefits:

- multiple barcodes per ingredient
- easy to update
- no recipe breakage

---

# Catalog Changes

The Catalog sheet now includes a new column:

barcode_upc

This acts as a **legacy fallback** if Barcode_Map is missing.

Example:

| upc              | product_name | barcode_upc  |
| ---------------- | ------------ | ------------ |
| PORK_BACON_SLICE | Bacon        | 070662030321 |

---

# Resolver Logic

A new resolver function determines the canonical ingredient key.

resolveIngredientUpcFromCode()

### Resolution Order

1️⃣ Check `Barcode_Map`

barcode_upc → ingredient_upc

2️⃣ Check `Catalog.barcode_upc`

barcode_upc → Catalog.upc

3️⃣ Direct ingredient match

input == ingredient_upc

4️⃣ If barcode is unknown → reject

unknown_barcode

5️⃣ If not numeric → treat as pseudo UPC

EGG
BACON
MILK

---

# Why Unknown Barcodes Are Rejected

If the system automatically created ingredients for unknown barcodes, the catalog would quickly become corrupted.

Example of bad behavior:

070662030321
070662030338
070662030339

Three separate catalog items.

Instead the system now forces mapping first.

---

# Catalog Safety Improvements

`ensureCatalogItem()` was rewritten to prevent corruption.

New rules:

❌ Never create catalog entries from raw barcodes
❌ Never generate UPCs from product_name
✔ Always resolve barcode → ingredient_upc first
✔ Throw error if barcode unknown

This ensures the catalog remains clean.

---

# What This Enables

This architecture unlocks several future capabilities.

### Reliable Scanning

Kitchen staff can scan products without worrying about vendor differences.

---

### Vendor Flexibility

Multiple distributors can supply the same ingredient.

---

### Inventory Accuracy

Inventory is tracked by ingredient, not package.

---

### Recipe Stability

Recipes remain stable regardless of barcode changes.

---

# Future Enhancements

## 1. Auto Barcode Learning

Unknown barcodes could trigger a manager workflow:

Scan → Unknown Barcode
↓
Manager maps barcode → ingredient
↓
Barcode_Map updated

---

## 2. Barcode API Assistance

Optional barcode lookup could suggest ingredients:

scan → UPC API → suggested ingredient

Manager confirms mapping.

---

## 3. Multi-Pack Conversion

Future improvement:

barcode → pack_size → ingredient units

Example:

1 case bacon = 12 packs

---

## 4. Scan Purchase Logging

Future feature:

scan → purchase event
↓
Inventory_Adjustments

---

## 5. Smart Vendor Tracking

Future capability:

barcode → vendor → price tracking

---

# System Stability Impact

This change improves stability significantly.

### Before

barcode → inventory

Fragile.

---

### After

barcode → ingredient → inventory

Stable.

---

# Migration Impact

No existing recipes or inventory data were changed.

Existing pseudo UPC values remain valid:

EGG
BACON
MILK

They simply bypass barcode resolution.

---

# Summary

This update introduces a robust architecture separating:

external barcodes
from
internal ingredient identifiers

Key improvements:

- stable ingredient keys
- flexible barcode mapping
- protection against catalog corruption
- better support for real-world purchasing workflows

This foundation allows future features like:

- auto barcode learning
- smart vendor tracking
- advanced purchasing analytics
