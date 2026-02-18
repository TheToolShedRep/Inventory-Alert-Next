# Document 8: `SCALING_STRATEGY.md`

Copy this into:

```
docs/SCALING_STRATEGY.md
```

---

# Inventory Alert System

## Scaling Strategy

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Phase 1 Complete / Scaling Planned

---

# Purpose

This document defines:

- How the system scales beyond one location
- When Google Sheets becomes a limitation
- Migration strategy to a database
- How to evolve into SaaS
- Infrastructure evolution plan
- Revenue model considerations

This is the growth blueprint.

---

# Current State (Baseline)

Architecture today:

- Single location
- Google Sheets as ledger
- GitHub cron automation
- Render-hosted Next.js backend
- Header-based internal automation security
- Email alerts via Resend

Designed for:

- Low cost
- Simplicity
- Deterministic logic
- Owner-operated café

---

# Stage 1: Multi-Location Support (Low Complexity Scale)

## Trigger Condition

- 2–5 locations
- Same owner group
- Similar menus

---

## Required Changes

Add `location_id` column to:

- Catalog
- Purchases
- Inventory_Usage
- Shopping_List
- Recipes (optional)
- Sales_Daily

Update logic to filter by location:

```
daily-run?location=front
daily-run?location=downtown
```

---

## Result

- Same Google Sheet
- Location partitioned logic
- No infrastructure change yet
- Still low cost

---

# Stage 2: Structured Multi-Tenant Model

## Trigger Condition

- Different businesses
- Separate ownership
- 5+ total locations

Google Sheets becomes fragile at this point.

---

## Limitations of Sheets at Scale

- Row performance degradation
- No row-level access control
- Harder to isolate tenants
- Limited concurrency control
- No relational integrity

---

# Stage 3: Database Migration (Supabase/Postgres)

## Trigger Condition

- 10+ locations
- Real SaaS onboarding
- Need for authentication and permissions

---

## Migration Strategy

Replace:

```
Google Sheets ledger
```

With:

```
Postgres (Supabase)
```

Tables:

- locations
- catalog
- purchases
- inventory_usage
- recipes
- alerts
- shopping_list
- system_log

---

## Why Migration Is Clean

Because:

- Business logic already lives in code
- Sheets are treated as abstraction layer
- No frontend tightly coupled to Sheets
- Header-driven column logic used

System designed for backend swap.

---

# Infrastructure Scaling

---

## Stage A (Current)

- Single Render instance
- Single cron
- Google Sheets
- Email via Resend

---

## Stage B

- Database (Supabase)
- Clerk authentication
- Admin dashboard
- Location-based routing

---

## Stage C

- Background worker for inventory math
- Queue system (BullMQ or Supabase functions)
- Scheduled jobs internal to backend
- Monitoring + alerting

---

# Performance Scaling

---

## Current Risk Points

- Large Sheets read operations
- Full ledger scans on reorder-check
- Single-threaded execution

---

## Future Optimizations

- Precomputed on-hand snapshot table
- Incremental inventory updates
- Cache layer for catalog
- Batch processing per location
- Partial daily-run logic

---

# Cost Scaling Model

---

## Current Costs

- Render hosting
- Resend usage
- Time

Sheets free.

---

## SaaS Model Costs

- Database hosting
- Auth provider (Clerk)
- Background workers
- Monitoring tools

Revenue must exceed infra cost.

---

# SaaS Evolution Path

---

## Step 1 — Admin Login

- Add Clerk
- Protect dashboard
- Assign roles

---

## Step 2 — Tenant Model

Add:

```
organization_id
```

All tables reference organization.

---

## Step 3 — Self-Onboarding

Allow:

- Create account
- Add location
- Upload catalog
- Connect POS

---

## Step 4 — Subscription Model

Plans:

- Basic (single location)
- Pro (multi-location)
- Enterprise

Billing via Stripe.

---

# Security at Scale

When multi-tenant:

- Replace INTERNAL_API_KEY with:
  - Signed internal job token
  - Or server-only cron worker

- Role-based access control
- Encrypted secret storage
- Per-tenant API boundaries

---

# Advanced Inventory Intelligence

Scaling unlocks:

- Cross-location analytics
- Demand forecasting
- Waste prediction
- Supplier performance metrics
- Bulk ordering optimization

System evolves from:

“Alert tool”

To:

“Operational intelligence engine”

---

# Architectural Decision Points

---

## Stay on Sheets If:

- ≤ 5 locations
- Single ownership
- Low concurrency
- Low automation complexity

---

## Migrate to Database If:

- ≥ 10 locations
- Multiple owners
- Need per-user access control
- High data volume
- Real SaaS launch

---

# Expansion Vision

Phase 1:
Single café automation

Phase 2:
Multi-location support

Phase 3:
Structured SaaS

Phase 4:
Vendor integration layer

Phase 5:
Predictive inventory AI

---

# Risk Analysis

| Risk                  | Mitigation            |
| --------------------- | --------------------- |
| Sheet corruption      | Version history       |
| Key leakage           | Secret rotation       |
| Data growth           | DB migration          |
| Vendor API dependency | Abstract vendor layer |
| POS API changes       | Adapter pattern       |

---

# Scaling Status (2026-02-18)

System is:

- Architecturally migration-ready
- Security-boundary defined
- Low-cost optimized
- Deterministic

Scaling path defined.

---

# End of Document
