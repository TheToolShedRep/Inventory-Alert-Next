---

# Document 4: `CHANGELOG.md`

Copy this into:

```
docs/CHANGELOG.md
```

---

# Inventory Alert System

## Changelog

All notable changes to this project will be documented in this file.

Format inspired by [Keep a Changelog](https://keepachangelog.com/).

---

# [1.0.0] – 2026-02-18

## Production Security + Automation Release

### Added

- INTERNAL_API_KEY header-based protection system
- `src/lib/auth/internal.ts` security gate
- Protection for:
  - `/api/inventory/daily-run`
  - `/api/inventory-math/run`
  - `/api/inventory/reorder-check`
  - `/api/inventory/reorder-email`
  - `/api/purchase`

- GitHub Actions scheduled automation (`daily-run.yml`)
- Daily cron at 11:00 UTC
- System_Log sheet tab for automation audit trail
- Production secret rotation process
- Secure header-based automation trigger
- Debug-safe GitHub workflow validation

---

### Changed

- All protected route handlers updated to accept `(req: Request)`
- `.env.local` INTERNAL_API_KEY format standardized (no quotes)
- Reorder pipeline moved to secured internal boundary
- daily-run endpoint converted to orchestration controller
- Production calls now use Render origin base URL

---

### Fixed

- 401 Unauthorized due to empty shell env variable
- 401 Unauthorized due to quoted `.env.local` value
- GitHub exit code 22 (curl --fail on HTTP >= 400)
- YAML indentation errors in GitHub Actions
- Render environment variable mismatch
- Clerk middleware confusion during internal endpoint calls

---

### Security Improvements

- Fail-closed internal automation endpoints
- Separation of public `/api/alert` from internal inventory logic
- Removal of public reorder/email execution risk
- Explicit secret rotation procedure
- Prevention of Resend abuse via public access

---

### Operational Improvements

- Deterministic daily automation
- Ledger-based on-hand calculation
- End-to-end validation via curl
- Manual GitHub workflow dispatch for debugging
- Improved deployment documentation

---

### Architecture Status

System now:

- Automated
- Secured
- Auditable
- Production verified
- Cron-driven
- Low-cost (Google Sheets ledger)

---

# [0.4.0] – 2026-02-15

## Reorder Detection + Email System

### Added

- `/api/inventory/reorder-check`
- `/api/inventory/reorder-email`
- Shopping_List tab overwrite logic
- Reorder point + par level logic
- Resend email integration

### Changed

- Catalog sheet expanded with:
  - reorder_point
  - par_level
  - preferred_vendor
  - default_location
  - base_unit

---

# [0.3.0] – 2026-02-14

## Inventory Math Ledger System

### Added

- `/api/inventory-math/run`
- Inventory_Usage sheet
- Theoretical depletion via:
  - Sales_Daily
  - Recipes

- Replace mode for deterministic recalculation

### Architecture Shift

Inventory model converted to:

```
On Hand = Purchases - Inventory_Usage
```

Ledger-based instead of mutable stock tracking.

---

# [0.2.0] – 2026-02-10

## POS Sales Sync

### Added

- `/api/toast/sales-sync`
- Sales_Daily tab population
- Date-based sync window
- Top_10 debug summary

---

# [0.1.0] – 2026-02-08

## Initial Alert System

### Added

- `/api/alert`
- QR scan inventory reporting
- Google Sheets Alerts tab
- Resend email notifications
- Basic logging

---

# Versioning Strategy

Current versioning is milestone-based, not semantic-release automated.

Version increments follow:

- MAJOR = architecture shift or security model change
- MINOR = feature additions
- PATCH = bug fixes

---

# Future Entries

Upcoming versions may include:

- Prep depletion alerts
- Vendor cart API integration
- Admin dashboard
- Health-check automation
- Rate limiting layer

---

# End of File
