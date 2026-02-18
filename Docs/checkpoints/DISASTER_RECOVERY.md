# Document 6: `DISASTER_RECOVERY.md`

---

# Inventory Alert System

## Disaster Recovery Plan

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Production Stable

---

# Purpose

This document defines:

- What to do in worst-case scenarios
- How to recover from catastrophic failures
- How to restore secrets
- How to recover corrupted data
- How to bring the system back online

This is the “everything is broken” guide.

If something goes very wrong, follow this document calmly and sequentially.

---

# Recovery Philosophy

The system was intentionally designed to be:

- Deterministic
- Ledger-based
- Stateless at runtime
- Recoverable from Google Sheets alone

There is no hidden database.

If code disappears but Sheets remain, the system can be rebuilt.

---

# Disaster Scenarios Covered

1. Render service deleted or corrupted
2. GitHub repository lost
3. INTERNAL_API_KEY compromised
4. Google Sheets corrupted or deleted
5. Resend account compromised
6. Accidental mass inventory corruption
7. Full environment wipe

---

# Scenario 1 — Render Service Lost

## Symptoms

- 404 on domain
- GitHub Actions failing
- Service missing in Render dashboard

## Recovery Steps

1. Create new Render service
2. Connect GitHub repository
3. Set Build Command:

   ```
   npm install && npm run build
   ```

4. Set Start Command:

   ```
   npm start
   ```

5. Re-add environment variables:
   - INTERNAL_API_KEY
   - GOOGLE_SERVICE_ACCOUNT_EMAIL
   - GOOGLE_PRIVATE_KEY
   - GOOGLE_SHEETS_ID
   - RESEND_API_KEY

6. Deploy
7. Test:

   ```bash
   curl -H "x-api-key: KEY" https://new-url/api/inventory/daily-run
   ```

If 200 → System restored.

---

# Scenario 2 — INTERNAL_API_KEY Compromised

## Symptoms

- Suspicious automation triggers
- Unexpected reorder emails
- Key accidentally committed

## Immediate Action

1. Generate new key:

   ```
   openssl rand -hex 32
   ```

2. Update Render environment variable
3. Update GitHub secret
4. Restart Render service
5. Manually test endpoint
6. Invalidate any old local shells

Old key becomes unusable immediately.

---

# Scenario 3 — GitHub Repository Lost

If repository deleted or corrupted:

## Recovery Options

### Option A — Restore from GitHub History

If soft-deleted:

- Restore from GitHub repository settings

### Option B — Rebuild from Local Copy

If local machine still has repo:

```bash
git remote add origin NEW_REPO_URL
git push -u origin main
```

### Option C — Rebuild From Sheets (Worst Case)

Because logic is in code, but data is in Sheets:

- Recreate Next.js app
- Re-implement:
  - inventory-math
  - reorder-check
  - reorder-email
  - daily-run

- Reconnect Sheets

Sheets remain source of truth.

---

# Scenario 4 — Google Sheets Corrupted

## Symptoms

- Missing tabs
- Deleted rows
- Incorrect ledger values

## Immediate Action

1. Check Google Sheets Version History
2. Restore to last known good version

Google Sheets maintains revision history automatically.

---

## If Sheet Fully Deleted

If permanently deleted:

- Restore from Google Drive trash
- If unavailable, restore from exported backup (if maintained)

If no backup exists:

Inventory must be reconstructed from:

- Purchase receipts
- POS sales history
- Vendor invoices

System can rebuild Inventory_Usage by re-running:

```
/api/inventory-math/run?mode=replace
```

---

# Scenario 5 — Resend Compromised

## Symptoms

- Unauthorized emails
- Resend account breach

## Recovery Steps

1. Rotate RESEND_API_KEY
2. Update Render environment variable
3. Restart service
4. Test reorder-email manually
5. Monitor email logs

---

# Scenario 6 — Inventory Corruption

If bad data written to Purchases or Recipes:

## Recovery Steps

1. Fix incorrect rows in Sheets
2. Run:

   ```
   /api/inventory-math/run?mode=replace
   ```

3. Run:

   ```
   /api/inventory/reorder-check
   ```

4. Verify Shopping_List

Ledger model allows full recalculation.

No permanent corruption.

---

# Scenario 7 — Full Environment Wipe

If:

- Render deleted
- GitHub deleted
- Secrets lost

But Google Sheets still exists:

## Recovery Order

1. Recreate GitHub repo
2. Recreate Next.js project
3. Re-add:
   - Sheets integration
   - Inventory logic
   - Reorder logic
   - Email logic
   - INTERNAL_API_KEY gate

4. Deploy to Render
5. Reconnect Sheets
6. Generate new secrets

Data lives in Sheets.
Logic can be rewritten.

System recoverable.

---

# Backup Strategy

Currently:

- Google Sheets acts as persistent ledger
- Google provides version history
- GitHub acts as code backup

Recommended Future Enhancements:

- Weekly automatic Sheet export
- Encrypted secret manager storage
- Offsite backup copy of Sheets

---

# Disaster Severity Levels

## Level 1 — Minor

- Single endpoint fails
- Email fails
- Workflow error

Solution: Manual run + debug

---

## Level 2 — Service Disruption

- Render down
- GitHub workflow broken

Solution: Restart + redeploy

---

## Level 3 — Security Compromise

- Key leaked
- Email abuse

Solution: Rotate secrets immediately

---

## Level 4 — Data Loss

- Sheets deleted
- Ledger damaged

Solution: Restore from version history

---

# Why This System Is Recoverable

Because:

- No state stored in memory
- No mutable inventory counter
- All inventory derived from ledger
- All code version-controlled
- Secrets centralized
- Automation externalized via GitHub

This is intentional architecture.

---

# Disaster Recovery Status

As of 2026-02-18:

- System is fully recoverable
- No single point of failure
- Ledger-based model ensures recalculation
- Automation re-creatable
- Secrets rotatable

System classified as:

**Low infrastructure dependency / High recoverability**

---

# End of Document
