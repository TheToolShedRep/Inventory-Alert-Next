# Alerts Pipeline Stable

Date: 2026-02-09

Verified:

- /api/alert writes to Sheets with correct column alignment
- source logged (memo/qr)
- cancel updates status + canceled_at
- resolve updates status + resolved_at
- checklist resolves via /api/alert/resolve
- health endpoints:
  - /api/health/alerts
  - /api/health/sheets
