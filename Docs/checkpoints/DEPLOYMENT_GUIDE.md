# Document 2: `DEPLOYMENT_GUIDE.md`

Copy this into:

```
docs/DEPLOYMENT_GUIDE.md
```

---

# Inventory Alert System

## Deployment Guide

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Production Stable

---

# Purpose

This document explains:

- How to deploy the application
- Required environment variables
- Production setup on Render
- GitHub Actions configuration
- Local development setup
- How to rotate secrets safely
- How to verify production health

This is the operational playbook.

---

# Tech Stack

- **Next.js (App Router)**
- **Render** (Hosting)
- **Google Sheets API**
- **Resend** (Email)
- **GitHub Actions** (Cron automation)

---

# Production Deployment (Render)

## 1️⃣ Render Service Setup

- Runtime: Node
- Build Command:

  ```
  npm install && npm run build
  ```

- Start Command:

  ```
  npm start
  ```

---

## 2️⃣ Required Environment Variables (Production)

Set these in **Render → Service → Environment**:

### Core

```
INTERNAL_API_KEY=<secure-random-string>
```

### Google Sheets

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
GOOGLE_SHEETS_ID=...
```

### Email (Resend)

```
RESEND_API_KEY=...
```

---

# Generating Secure INTERNAL_API_KEY

Generate using:

```bash
openssl rand -hex 32
```

Example output:

```
a4f91c3c2a7e7d9b2c6d4e91b8c3f6d7a9e2f4b1c8d3e7f6a1b2c3d4e5f6a7b8
```

Paste this into:

- Render environment variables
- GitHub repository secrets

Do NOT commit this to the repository.

---

# Local Development Setup

Create `.env.local` (ignored by Git):

```
INTERNAL_API_KEY=dev-secret-123
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
GOOGLE_SHEETS_ID=...
RESEND_API_KEY=...
```

Restart dev server after any changes:

```bash
Ctrl + C
npm run dev
```

---

# 🧪 Local Testing

## Test protected endpoint

```bash
export INTERNAL_API_KEY=dev-secret-123

curl -i "http://localhost:3000/api/inventory/daily-run" \
  -H "x-api-key: $INTERNAL_API_KEY"
```

Expected:

```
HTTP/1.1 200 OK
```

---

# GitHub Actions Cron Setup

## File

```
.github/workflows/daily-run.yml
```

## Required GitHub Secrets

Go to:

```
Repo → Settings → Secrets and variables → Actions
```

Add:

```
INTERNAL_API_KEY
DAILY_RUN_URL
```

Example DAILY_RUN_URL:

```
https://inventory-alert-next.onrender.com/api/inventory/daily-run
```

---

# Cron Schedule

Current schedule:

```
0 11 * * *
```

Meaning:

- 11:00 UTC daily
- Approx. 6:00 AM Eastern Time (baseline)

Note: GitHub cron uses UTC only.

---

# Common Deployment Issues

---

## Issue: 401 Unauthorized

### Causes:

- Wrong INTERNAL_API_KEY
- Secret not set in GitHub
- Secret not set in Render
- Shell variable empty

### Fix:

Verify:

```bash
echo $INTERNAL_API_KEY
```

Verify GitHub secret exists.

Verify Render env matches exactly.

---

## Issue: 500 Server misconfigured

Message:

```
Server misconfigured: INTERNAL_API_KEY missing
```

### Cause:

Render environment variable not set.

### Fix:

Add env var and redeploy.

---

## Issue: curl exit code 22 in GitHub

### Meaning:

HTTP >= 400 with `--fail`.

### Fix:

Check secret mismatch.

---

## Issue: YAML indentation errors

All lines under:

```yaml
run: |
```

Must be indented.

---

# Secret Rotation Procedure

If key must be rotated:

1. Generate new key.
2. Update in Render.
3. Update in GitHub secrets.
4. Restart Render service.
5. Manually run GitHub workflow to confirm.
6. Delete old key from local shell session.

---

# Production Health Verification

### Manual test:

```bash
curl -i "https://inventory-alert-next.onrender.com/api/inventory/daily-run" \
  -H "x-api-key: YOUR_KEY"
```

Should return 200.

### GitHub Test:

- Go to Actions
- Run workflow manually
- Confirm blue check

---

# How to Confirm Automation Ran

Check:

- GitHub Actions history
- `System_Log` tab in Google Sheets
- Email inbox for reorder alerts

All three should align.

---

# Deployment Philosophy

- Fail closed, not open.
- Never expose automation endpoints publicly.
- Never commit secrets.
- Always verify with curl after deploy.
- Test locally before pushing.

---

# Rollback Strategy

If deployment fails:

1. Revert to previous Git commit.
2. Redeploy on Render.
3. Verify environment variables unchanged.
4. Manually trigger daily-run.

---

# 🏁 Current Production Status

- Secure
- Automated
- Verified
- Auditable
- Stable

---

# End of Document
