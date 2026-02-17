# 🧠 Inventory Alert System – Evolution Documentation

---

## 🔹 Phase 0 — Original Vision (QR-Based Alerts)

### Goal

Build a QR-based low-stock alert system for restaurants.

### Core Idea

Each product would have:

- A QR code
- Staff scans when low
- Logs to Google Sheets
- Sends email + push notification
- Adds to manager checklist

### Tech Stack

- Next.js frontend
- Google Sheets as database
- OneSignal (push)
- Resend (email)
- QR code generator

### Why It Made Sense

- $0 infrastructure
- No POS integration required
- Fast to deploy
- Clear workflow

---

## 🔹 Phase 1 — QR Alert System (Working Prototype)

### What Worked

- QR scan → `/api/alert`
- Logged to Google Sheets
- Email notifications sent
- Push notifications sent
- Alerts sheet became source of truth

### What Failed (Operationally)

#### 🚩 Problem 1: Too Many Products

Front of house feedback:

> “There are too many products to flip through a QR binder.”

This was not a technical failure — it was a UX failure.

#### 🚩 Problem 2: Binder Navigation

Even with QR:

- Staff had to find the correct code
- Slowed them during rush
- Required product recall

QR works best when:

- Few items
- Items are fixed
- Environment is calm

Restaurants are none of those.

---

## 🔹 Phase 2 — Memo Mode (Free Input / Voice)

### Pivot

Instead of scanning:
Staff could type or speak:

> “We’re out of milk.”

### New Flow

- Click Memo Mode
- Enter message
- System logs alert
- Sends notifications
- Adds to checklist

### Why It Was Smart

- Faster
- No QR hunting
- Lower cognitive load
- Better during rush

---

### New Problems Introduced

#### 🚩 Problem 3: Product Standardization

With QR:

- Product is predefined.

With Memo:

- “milk”
- “whole milk”
- “2% milk”
- “milk front”
- “milk fridge”

This introduced:

- Duplicate alerts
- Inconsistent naming
- Harder inventory math

Partial solution:

- Added `source` field (`qr`, `memo`, `legacy`)
- Improved logging structure

But normalization remains an open scaling issue.

---

## 🔹 Phase 3 — Shopping Scan + Purchases Logging

System expanded to include:

- Catalog sheet
- Purchases sheet
- Alerts sheet
- Subscribers sheet
- Prep sheet
- Inventory Math sheet

At this point, system evolved beyond alerts into a lightweight inventory OS.

---

## 🔹 Phase 4 — Inventory Math & Toast Integration

### Shift

From:

> Manual alerting

To:

> Automatic inventory deduction via sales

### Added

- `/api/toast/sales-sync`
- `Sales_Daily` sheet
- Prep sheet mapping menu → ingredients
- Inventory math formulas
- On-hand calculation:
