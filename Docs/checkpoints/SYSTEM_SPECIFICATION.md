# 📘 Document 9: `SYSTEM_SPECIFICATION.md`

Copy this into:

```
docs/SYSTEM_SPECIFICATION.md
```

---

# Inventory Alert System

## System Specification

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Production Stable

---

# 1️⃣ Overview

The Inventory Alert System is a ledger-based, automation-driven inventory monitoring platform designed to:

- Track theoretical inventory depletion
- Detect reorder thresholds
- Generate shopping lists
- Send automated email alerts
- Operate at low cost
- Be migration-ready for future SaaS expansion

The system uses:

- Google Sheets as a ledger datastore
- Next.js (App Router) for API logic
- Render for hosting
- GitHub Actions for scheduled automation
- Resend for email delivery

---

# 2️⃣ System Goals

## Functional Goals

- Maintain accurate on-hand inventory via ledger math
- Trigger reorder alerts deterministically
- Run fully automated daily processing
- Secure automation endpoints
- Remain human-readable and auditable

## Non-Functional Goals

- Low infrastructure cost
- Deterministic behavior
- Recoverability
- Migration readiness
- Minimal moving parts

---

# 3️⃣ High-Level Architecture

```
GitHub Cron
      ↓
GitHub Actions
      ↓
x-api-key header
      ↓
Render (Next.js API)
      ↓
Inventory Logic Layer
      ↓
Google Sheets Ledger
      ↓
Resend Email
```

---

# 4️⃣ Core Components

---

## 4.1 Frontend

Location:

```
src/app/*
```

Purpose:

- QR inventory alerts
- Memo mode
- Future admin dashboard

Currently minimal UI usage.

---

## 4.2 API Layer

Location:

```
src/app/api/*
```

### Public Endpoint

- `/api/alert`

### Protected Endpoints

- `/api/inventory/daily-run`
- `/api/inventory-math/run`
- `/api/inventory/reorder-check`
- `/api/inventory/reorder-email`
- `/api/purchase`

---

## 4.3 Security Gate

Location:

```
src/lib/auth/internal.ts
```

Mechanism:

```
x-api-key header required
```

Fail-closed model.

---

## 4.4 Google Sheets Integration

Sheets accessed via:

- `readTabAsObjects`
- `overwriteTabValues`
- Append logic where needed

Sheets serve as:

- Catalog
- Ledger
- Alert output
- System log

---

# 5️⃣ Data Model Specification

---

## 5.1 Catalog

Key Fields:

- upc (primary identifier)
- product_name
- base_unit
- reorder_point
- par_level
- preferred_vendor
- default_location
- active

---

## 5.2 Purchases

Fields:

- timestamp
- upc
- qty_purchased
- base_units_added
- vendor
- location

Purpose:

Records stock additions.

---

## 5.3 Inventory_Usage

Fields:

- date
- menu_item_clean
- ingredient_upc
- theoretical_used_qty

Purpose:

Records derived depletion.

---

## 5.4 Recipes

Defines mapping:

```
menu_item → ingredient_upc + qty_per_item
```

---

## 5.5 Sales_Daily

Imported from POS.

Fields:

- date
- menu_item
- qty_sold

---

## 5.6 Shopping_List

Generated output.

Fields:

- timestamp
- upc
- product_name
- on_hand_base_units
- reorder_point
- par_level
- qty_to_order_base_units
- preferred_vendor
- default_location

Overwritten daily.

---

## 5.7 System_Log

Automation audit log.

Fields:

- timestamp
- date_processed
- inventory_rows_written
- items_flagged
- emails_sent
- duration_ms
- status

---

# 6️⃣ Inventory Algorithm Specification

---

## 6.1 On-Hand Calculation

```
on_hand = SUM(purchases) - SUM(inventory_usage)
```

Derived dynamically.

No stored inventory count field exists.

---

## 6.2 Reorder Logic

Trigger if:

```
on_hand <= reorder_point
```

Quantity to order:

```
par_level - on_hand
```

Fallback:

```
reorder_point - on_hand
```

---

## 6.3 Daily Pipeline Order

1. inventory-math/run
2. reorder-check
3. reorder-email
4. System_Log write

Orchestrated by:

```
/api/inventory/daily-run
```

---

# 7️⃣ Security Specification

- Protected endpoints require INTERNAL_API_KEY
- Key stored only server-side
- Fail-closed if missing
- No secrets returned in API responses
- No secret logged

---

# 8️⃣ Automation Specification

GitHub Actions:

```
0 11 * * *
```

Calls:

```
/api/inventory/daily-run
```

With header:

```
x-api-key: secret
```

curl fails on HTTP >= 400.

---

# 9️⃣ Error Handling

Return formats:

401:

```
{ ok: false, error: "Unauthorized" }
```

500:

```
{ ok: false, error: "Server error" }
```

All errors JSON formatted.

---

# 🔟 Performance Considerations

Current limitations:

- Full ledger scans
- Entire sheet read per run
- Single-threaded execution

Acceptable for:

- Small-to-medium location
- Single-tenant model

Migration path defined in SCALING_STRATEGY.md.

---

# 11️⃣ Operational Constraints

- Requires Google Sheets availability
- Requires Render uptime
- Requires Resend availability
- Requires GitHub cron reliability

System remains manually triggerable.

---

# 12️⃣ Extensibility

Designed to support:

- Multi-location via location_id
- Multi-tenant via organization_id
- Database migration
- Vendor API integration
- Admin authentication

---

# 13️⃣ Known Limitations

- No role-based UI yet
- No rate limiting on public endpoint
- No vendor cart integration
- No forecasting model yet
- No multi-location partitioning yet

---

# 14️⃣ Compliance & Data Sensitivity

System stores:

- Inventory data
- Vendor data
- Operational logs

Does NOT store:

- Customer personal data
- Payment information
- Health information

Low regulatory exposure.

---

# 15️⃣ Version Status

As of 2026-02-18:

- Production stable
- Secure
- Deterministic
- Recoverable
- Automation verified

System classified as:

**Single-Tenant Operational Inventory Platform**

---

# End of Document
