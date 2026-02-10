# Prep Pipeline — System Documentation

**Status:** Stable / Verified  
**Last Updated:** 2026-02-09

## Purpose

Prep is an append-only logging pipeline that stores menu-level usage + ingredient depletion metadata.
It will later power inventory math, restock alerts, and prep depletion alerts.

## Google Sheet Tab: Prep

Locked headers:

- date
- menu_item
- menu_qty
- menu_item_clean
- Do not edit auto calc (READ ONLY)
- ingredient
- qty_used
- unit
- cost
- notes
- source
- IP
- user_agent

Rules:

- Never write to `Do not edit auto calc`.
- New columns must be appended to the end.
- Writes are header-driven (order safe).

## Endpoint: POST /api/prep

Writes a new Prep row using header-driven mapping.

Required:

- date (YYYY-MM-DD)
- menu_item (string)
- menu_qty (number)

Optional:

- ingredient, qty_used, unit, cost, notes, source

Auto-added:

- IP
- user_agent

## Endpoint: GET /api/health/prep

Returns:

- total row count
- counts by source (legacy fallback if missing)
- headers
- sample rows
- timing
