# Document 1: `ARCHITECTURE_OVERVIEW.md`

# Inventory Alert System

## Architecture Overview

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Production Stable

---

# Purpose

This document explains:

- The full system architecture
- Data flow between components
- Why Google Sheets is used as a ledger
- How automation executes daily
- Public vs private API boundaries
- Deployment model

This is the high-level “how everything fits together” reference.

---

# System Philosophy

The system is intentionally:

- Low-cost (no database hosting)
- Ledger-based (append-only where possible)
- Deterministic (no hidden calculations)
- Auditable (everything traceable in Sheets)
- Secure at the automation boundary
- POS-agnostic (future scalable)

Google Sheets acts as the ledger.
The codebase performs the logic.

---

# 🏗 Core Components

## 1️⃣ Frontend (Next.js App Router)

- QR Alert UI
- Memo Mode
- Manager tools
- Internal API routes

Deployed to:

- Render (Production)
- Local dev server

---

## 2️⃣ API Layer (Next.js Route Handlers)

Located under:

```
/src/app/api/*
```

Major API groups:

### Public

- `/api/alert` → Staff low-stock reporting

### Private (INTERNAL_API_KEY protected)

- `/api/inventory/daily-run`
- `/api/inventory-math/run`
- `/api/inventory/reorder-check`
- `/api/inventory/reorder-email`
- `/api/purchase`

---

## 3️⃣ Google Sheets (Ledger System)

Sheets act as structured storage.

Primary tabs:

- `Catalog`
- `Purchases`
- `Inventory_Usage`
- `Recipes`
- `Sales_Daily`
- `Shopping_List`
- `System_Log`

Sheets are:

- Read via `readTabAsObjects`
- Written via `overwriteTabValues`
- Appended for logs and usage

No SQL database is currently used.

---

## 4️⃣ Inventory Computation Model

Inventory is calculated as:

```
On Hand = SUM(Purchases) - SUM(Inventory_Usage)
```

Where:

- Purchases = actual stock additions
- Inventory_Usage = theoretical depletion from POS sales

There is no mutable "inventory count" column.
The system derives stock state dynamically.

This prevents drift.

---

# Daily Automation Flow

## Step 1 — GitHub Cron

GitHub Actions runs daily at:

```
11:00 UTC
```

Triggers:

```
/api/inventory/daily-run
```

With header:

```
x-api-key: INTERNAL_API_KEY
```

---

## Step 2 — daily-run Endpoint

This orchestrates:

1. inventory-math/run
2. reorder-check
3. reorder-email
4. System_Log write

It acts as the pipeline controller.

---

## Step 3 — inventory-math/run

Reads:

- Sales_Daily
- Recipes

Writes:

- Inventory_Usage

This multiplies:

```
qty_sold × qty_per_item
```

---

## Step 4 — reorder-check

Reads:

- Catalog
- Purchases
- Inventory_Usage

Calculates:

```
on_hand = purchased - used
```

If:

```
on_hand <= reorder_point
```

Writes to:

```
Shopping_List
```

---

## Step 5 — reorder-email

Reads:

```
Shopping_List
```

If items exist:

- Sends email via Resend
- Logs result
- Returns JSON

---

# Security Model

Public Surface:

- `/api/alert`

Private Surface:

- All automation endpoints

Protection:

```
x-api-key header required
```

Key stored in:

- Render Environment Variables
- GitHub Repository Secrets

Fail-closed model enforced.

---

# Deployment Model

## Production

- Render hosts Next.js app
- GitHub Actions runs cron
- Google Sheets acts as datastore
- Resend handles email

## Local Dev

- Next.js local server
- Manual curl testing
- Local `.env.local`

---

# Logging Strategy

`System_Log` tab records:

- Timestamp
- Date processed
- Inventory rows written
- Items flagged
- Emails sent
- Duration
- Status

This provides:

- Auditability
- Automation validation
- Historical trace

---

# Cost Structure

Current recurring costs:

- Render hosting
- Resend email usage

Google Sheets = free
GitHub Actions = free (within limits)

No database hosting fees.

---

# Scalability Path

Future evolution:

Phase 2:

- Prep depletion alerts

Phase 3:

- Vendor API cart integration

Phase 4:

- POS plug-in abstraction

Phase 5:

- Migrate to Supabase/Postgres if needed

Architecture already supports this migration because:

- Logic layer is separated
- Sheets are treated like a database abstraction
- Header-driven column mapping avoids hard indexes

---

# Design Decisions

Why no database?

- Owner promised low maintenance cost
- Early phase validation
- Simpler debugging
- Human-readable storage

Why ledger-based?

- Prevents inventory drift
- Fully reconstructable history
- Easier debugging

Why GitHub cron instead of server cron?

- Safer
- Version-controlled
- Transparent
- Easier debugging

---

# 🏁 Current State

System is:

- Secure
- Automated
- Deterministic
- Auditable
- Production stable

---

# End of Document
