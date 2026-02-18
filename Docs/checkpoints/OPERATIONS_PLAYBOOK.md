# Document 5: `OPERATIONS_PLAYBOOK.md`

---

# Inventory Alert System

## Operations Playbook

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Production Operational

---

# Purpose

This document defines:

- What to do if automation fails
- How to manually trigger the pipeline
- How to diagnose production errors
- How to verify system health
- How to respond to common incidents

This is the **6:00 AM emergency guide**.

If something breaks, follow this document step-by-step.

---

# Normal Daily Operation

Every day at:

```
11:00 UTC (≈ 6:00 AM Eastern)
```

GitHub Actions triggers:

```
/api/inventory/daily-run
```

Expected behavior:

1. Inventory math runs
2. Reorder check runs
3. Shopping_List overwritten
4. Reorder email sent (if items flagged)
5. System_Log entry written

No manual action required.

---

# Daily Health Checklist

If everything is healthy:

- GitHub Actions shows green check
- System_Log has a new entry
- Owners receive reorder email (if needed)
- Shopping_List updated correctly

---

# Incident Response Guide

---

# Scenario 1 — No Email Received

### Step 1: Check GitHub Actions

Go to:

```
Repo → Actions → Inventory Daily Run
```

Is there a green check?

- Yes → Continue to Step 2
- No → Jump to Scenario 2

---

### Step 2: Check System_Log Tab

Look for today’s date.

Check:

- inventory_rows_written
- items_flagged
- emails_sent
- status

If:

- items_flagged = 0 → No reorder triggered (normal)
- emails_sent = 0 but items_flagged > 0 → Email failure

---

### Step 3: Test Email Manually

Run:

```bash
curl -i "https://inventory-alert-next.onrender.com/api/inventory/reorder-email" \
  -H "x-api-key: YOUR_PROD_KEY"
```

If 200 → Email working
If 401 → Key mismatch
If 500 → Resend issue

---

# Scenario 2 — GitHub Action Failed

Open failed run.

Look at:

- HTTP status
- Response body

---

## If 401 Unauthorized

Cause:

- INTERNAL_API_KEY mismatch between:
  - Render
  - GitHub Secrets

Fix:

1. Regenerate key if needed
2. Update both locations
3. Restart Render
4. Re-run workflow manually

---

## If 500 Server Misconfigured

Message:

```
Server misconfigured: INTERNAL_API_KEY missing
```

Cause:

Render environment variable missing.

Fix:

Add variable → Redeploy.

---

## If Exit Code 22

Meaning:

curl got HTTP >= 400.

Scroll up in logs to see response body.

---

# Scenario 3 — Shopping List Looks Wrong

Possible causes:

- Incorrect par_level
- Incorrect reorder_point
- Starting inventory not recorded
- Sales_Daily mismatch
- Recipes incorrect

---

## Step-by-Step Debug

1. Check Purchases tab
2. Check Inventory_Usage tab
3. Calculate:

```
SUM(purchased) - SUM(used)
```

4. Compare to reorder_point
5. Confirm expected result

System is deterministic — math will always explain result.

---

# Scenario 4 — Inventory Drift

Drift can only happen if:

- Purchases missing
- Recipes inaccurate
- Sales_Daily incomplete

Solution:

Run:

```
/api/inventory-math/run?mode=replace
```

This recalculates usage from scratch.

Ledger-based model ensures recovery is possible.

---

# Scenario 5 — Render Down

If Render is down:

- GitHub workflow fails
- curl returns non-200

Solution:

- Check Render dashboard
- Restart service
- Manually trigger workflow after recovery

---

# Manual Pipeline Execution

If automation fails, run manually:

### Step 1

```bash
curl -H "x-api-key: KEY" \
"https://inventory-alert-next.onrender.com/api/inventory/daily-run"
```

If 200 → System functioning.

---

# Secret Compromise Procedure

If key suspected leaked:

1. Generate new key:

   ```
   openssl rand -hex 32
   ```

2. Update Render
3. Update GitHub secrets
4. Restart Render
5. Test manually
6. Re-run GitHub workflow

Old key immediately invalid.

---

# Monitoring Signals

Watch for:

- Repeated 401 errors
- Large spikes in items_flagged
- Reorder emails sent multiple times
- Missing System_Log entries

These indicate:

- Security issue
- Logic issue
- Data inconsistency

---

# Backup Strategy

Because system uses Google Sheets:

- Sheets act as persistent ledger
- Manual export possible anytime
- No database snapshots required

Optional:

- Weekly manual Sheet export
- Or scheduled Sheet backup script (future enhancement)

---

# 🔁 Recovery From Data Mistake

If bad purchase entry added:

1. Correct or delete row in Purchases
2. Run:

```
/api/inventory-math/run?mode=replace
```

System recalculates from ledger.

No cascading corruption.

---

# Operational Philosophy

This system is:

- Deterministic
- Recoverable
- Transparent
- Minimal moving parts
- Easy to reason about

No hidden background processes.
No mutable state outside Sheets.

---

# Current Operational State

- Daily automation verified
- Security boundary enforced
- Email pipeline stable
- Inventory math deterministic
- Manual override always available

System is operationally sound.

---

# End of Document
