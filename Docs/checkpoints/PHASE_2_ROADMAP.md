# Document 7: `PHASE_2_ROADMAP.md`

# Inventory Alert System

## Phase 2 Roadmap

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Phase 1 Complete

---

# Purpose

Phase 1 delivered:

- Ledger-based inventory math
- Reorder detection
- Automated daily cron
- Secure internal automation boundary
- Email alerts
- Production stability

Phase 2 focuses on:

- Reducing manual work
- Increasing operational intelligence
- Improving alert accuracy
- Expanding automation value
- Preparing for scalability

This document defines what comes next.

---

# Phase 2 Objectives

1. Prep-Level Depletion Alerts
2. Smarter Inventory Signals
3. Alert Intelligence (Stateful Alerts)
4. Vendor Workflow Improvements
5. Operational Visibility
6. Foundation for Multi-Location Scaling

---

# 1️⃣ Prep-Level Depletion Alerts

## Problem

Current system tracks:

```
Finished inventory items
```

But not:

```
Prep batch levels
```

Example:

- Sold 12 chicken sandwiches
- Each uses 3 oz chicken salad
- We need prep alert before finished inventory runs out

---

## Goal

Add secondary alert system:

```
Prep depletion alerts
```

Not just reorder alerts.

---

## Implementation Concept

Add:

```
Prep_Levels tab
```

Columns:

- ingredient_upc
- prep_batch_size
- prep_par_level
- prep_alert_threshold
- current_prep_estimate

Depletion formula:

```
current_prep_estimate =
last_prep_batch - theoretical_usage_since_batch
```

---

## Phase 2 Milestone

New endpoint:

```
/api/inventory/prep-check
```

Triggered after daily-run.

---

# 2️⃣ Smarter Inventory Signals

Current logic:

```
on_hand <= reorder_point
```

Phase 2 adds:

- Rolling 7-day sales average
- Days of inventory remaining
- Velocity-based reorder logic

Example:

```
daily_avg_usage = last_7_days_usage / 7
days_remaining = on_hand / daily_avg_usage
```

Trigger alert if:

```
days_remaining <= 3
```

Instead of static threshold only.

---

# 3️⃣ Stateful Alert Model

Currently:

- Alerts overwrite Shopping_List daily

Phase 2:

Track alert lifecycle:

- active
- acknowledged
- ordered
- resolved

Add:

```
Alert_Status tab
```

With:

- alert_id
- upc
- status
- created_at
- resolved_at

This prevents:

- Duplicate alerts
- Alert fatigue
- Email spam

---

# 4️⃣ Vendor Workflow Improvements

Current:

- Email shopping list

Phase 2 goals:

Option A:

- “Generate formatted vendor sheet”

Option B:

- “Generate vendor-ready CSV”

Option C (Future):

- Add-to-cart links for vendors with e-commerce

Eventually:

- Button-triggered cart population

---

# 5️⃣ Operational Dashboard

Create simple admin dashboard:

Displays:

- Total SKUs
- SKUs below reorder
- SKUs below prep threshold
- Last daily-run timestamp
- Email status

Possible route:

```
/admin/dashboard
```

Clerk-protected.

---

# 6️⃣ Multi-Location Foundation

Phase 1 assumed:

Single location.

Phase 2 prepares for:

```
location_id column
```

Add to:

- Purchases
- Inventory_Usage
- Catalog
- Shopping_List

Daily-run becomes:

```
daily-run?location=front
```

Foundation for scaling into SaaS.

---

# 7️⃣ Inventory Intelligence Metrics

Add derived metrics tab:

```
Inventory_Metrics
```

Include:

- turnover rate
- waste estimate
- slow-moving items
- high-velocity items
- margin impact

This moves system from:

“Alert tool”

To:

“Operational intelligence tool”

---

# Phase 2 Security Considerations

If admin dashboard added:

- Clerk authentication required
- Role-based permissions
- Separate public vs admin boundaries

Automation key remains unchanged.

---

# 🛠 Technical Debt To Address

- Abstract Google Sheets calls into service layer
- Add lightweight validation for sheet schema
- Add better error classification
- Add health-check endpoint

---

# Phase 2 Deliverables (Ordered)

### 2.1 — Prep-Level Alerts

### 2.2 — Velocity-Based Reorder Logic

### 2.3 — Stateful Alert Tracking

### 2.4 — Admin Dashboard

### 2.5 — Vendor CSV Generator

### 2.6 — Multi-Location Column Support

---

# Suggested Timeline

Week 1:

- Prep alerts
- Velocity math

Week 2:

- Stateful alerts
- Dashboard skeleton

Week 3:

- Vendor workflow
- Multi-location prep

---

# Success Metrics

Phase 2 is successful if:

- Manual prep checks reduced
- Reorder timing improves
- Fewer surprise stockouts
- Fewer duplicate alerts
- Staff trust system

---

# Long-Term Vision

Phase 1:
Inventory alert system.

Phase 2:
Operational assistant.

Phase 3:
Vendor-integrated smart inventory.

Phase 4:
POS-agnostic SaaS product.

---

# Phase 2 Status

Phase 1 Complete
Phase 2 Ready To Begin

---

# End of Document
