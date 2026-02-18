# Inventory Alert System

## Security Hardening + Automation Implementation Log

**Date:** 2026-02-18  
**Status:** Production Stable ✅

---

# Purpose of This Document

This document captures:

- What was changed
- Why it was changed
- What broke during implementation
- How it was fixed
- Lessons learned
- Final architecture state

This serves as a permanent technical reference for future debugging, scaling, or onboarding.

---

# Phase Overview

This phase focused on:

1. Securing sensitive automation endpoints
2. Implementing an internal API key gate
3. Rotating secrets safely
4. Adding GitHub Actions cron automation
5. Debugging environment mismatches
6. Validating full production execution

---

# Problem: Sensitive Endpoints Were Public

Before this update, the following endpoints were publicly accessible:

- `/api/inventory/daily-run`
- `/api/inventory-math/run`
- `/api/inventory/reorder-check`
- `/api/inventory/reorder-email`
- `/api/purchase`

Risk factors:

- Anyone could trigger reorder emails
- Anyone could overwrite `Shopping_List`
- Anyone could execute inventory math
- Anyone could manipulate inventory

QR + Memo needed to remain public, but inventory automation must be private.

---

# 🛠 Solution: INTERNAL_API_KEY Gate

We introduced a server-side gate requiring a custom header:

Got it — the previous markdown must have been truncated after that line.

Below is a **complete, clean, copy-paste ready `.md` file** starting from the beginning and fully including the server-side gate section and everything after it.

You can paste this directly into:

```
docs/SECURITY_AUTOMATION_UPDATE_2026-02-18.md
```

---

```md
# Inventory Alert System

## Security Hardening + Automation Implementation Log

**Date:** 2026-02-18  
**Status:** Production Stable

---

# Purpose of This Document

This document captures:

- What was changed
- Why it was changed
- What broke during implementation
- How it was fixed
- Lessons learned
- Final architecture state

This serves as a long-term technical reference for debugging, onboarding, scaling, or refactoring.

---

# Phase Summary

This phase focused on:

1. Securing sensitive automation endpoints
2. Implementing an internal API key gate
3. Rotating secrets safely
4. Adding GitHub Actions cron automation
5. Debugging environment mismatches
6. Validating full production execution

---

# Initial Problem: Sensitive Endpoints Were Public

Before this update, the following endpoints were publicly accessible:

- `/api/inventory/daily-run`
- `/api/inventory-math/run`
- `/api/inventory/reorder-check`
- `/api/inventory/reorder-email`
- `/api/purchase`

### Risk

Anyone could:

- Trigger reorder emails
- Overwrite `Shopping_List`
- Execute inventory math
- Manipulate inventory
- Abuse Resend quota

QR + Memo needed to remain public.

Inventory automation did not.

---

# 🛠 Solution: INTERNAL_API_KEY Gate

We introduced a server-side gate requiring a custom header:
```

x-api-key: <INTERNAL_API_KEY>

```

Only requests with the correct key can execute protected endpoints.

---

#  Implementation

## File Created

```

src/lib/auth/internal.ts

````

### Implementation

```ts
import { NextResponse } from "next/server";

/**
 * Internal key gate for automation endpoints.
 * Fails closed if env var is missing.
 */
export function requireInternalKey(req: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  const key = req.headers.get("x-api-key");

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: INTERNAL_API_KEY missing" },
      { status: 500 }
    );
  }

  if (key !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}
````

---

# Endpoints Now Protected

Each of the following routes begins with:

```ts
const deny = requireInternalKey(req);
if (deny) return deny;
```

Protected routes:

- `/api/inventory/daily-run`
- `/api/inventory-math/run`
- `/api/inventory/reorder-check`
- `/api/inventory/reorder-email`
- `/api/purchase`

QR + Memo (`/api/alert`) intentionally remain public.

---

# Issues Encountered & Fixes

---

## Issue #1 — `req` Argument Missing

Some handlers were originally:

```ts
export async function GET() {
```

After adding:

```ts
requireInternalKey(req);
```

Runtime error occurred because `req` was undefined.

### Fix

Update to:

```ts
export async function GET(req: Request) {
```

---

## Issue #2 — 401 During curl Testing

Initial test returned:

```
401 Unauthorized
```

### Root Cause

Shell variable `$INTERNAL_API_KEY` was empty.

Verified with:

```
echo "KEY=[$INTERNAL_API_KEY]"
```

Output:

```
KEY=[]
```

### Fix

Export variable manually:

```bash
export INTERNAL_API_KEY="actual-secret"
```

---

## Issue #3 — Quoted Env Variable Mismatch

`.env.local` contained:

```
INTERNAL_API_KEY="dev-secret-123"
```

Git Bash preserved quotes:

```
"dev-secret-123"
```

Next.js strips quotes when loading environment variables.

Mismatch caused 401.

### Fix

Changed to:

```
INTERNAL_API_KEY=dev-secret-123
```

---

## Issue #4 — GitHub Actions Failed (Exit Code 22)

Workflow failed with:

```
Process completed with exit code 22
```

Exit code 22 = curl received HTTP >= 400 with `--fail`.

### Root Cause

GitHub secret `INTERNAL_API_KEY` was:

- Missing
- Or incorrect
- Or empty

### Fix

Added repository secret:

- Name: `INTERNAL_API_KEY`
- Value: production key (same as Render)

Workflow then succeeded.

---

## Issue #5 — YAML Indentation Errors

GitHub Actions failed due to improper indentation under `run: |`.

### Fix

Correct indentation:

```yaml
run: |
  set -euo pipefail
  echo "..."
```

All commands must be indented under `run:`.

---

# Secret Rotation

## Development

```
INTERNAL_API_KEY=dev-secret-123
```

## Production

Generated secure key:

```bash
openssl rand -hex 32
```

Updated in:

- Render Environment Variables
- GitHub Repository Secrets

---

# GitHub Actions Automation

## File

```
.github/workflows/daily-run.yml
```

## Trigger

- Scheduled daily at 11:00 UTC (6:00 AM ET baseline)
- Manual dispatch supported

## Secure Call

Workflow sends:

```
x-api-key: ${{ secrets.INTERNAL_API_KEY }}
```

To:

```
https://inventory-alert-next.onrender.com/api/inventory/daily-run
```

---

# Final Automation Flow

```
GitHub Cron
    ↓
GitHub Actions
    ↓
x-api-key header
    ↓
Render Production
    ↓
inventory-math/run
    ↓
reorder-check
    ↓
Shopping_List overwrite
    ↓
reorder-email
    ↓
Resend email
    ↓
System_Log entry
```

---

# Final Validation

## Local

- reorder-check → 200
- reorder-email → 200
- daily-run → full pipeline success

## Production

Manual curl with header:

```
HTTP/1.1 200 OK
```

GitHub manual run: Success

---

# Lessons Learned

1. Always fail closed when implementing security gates.
2. Shell variables do not automatically load from `.env.local`.
3. Quotes in `.env.local` can cause header mismatches.
4. GitHub secrets are never viewable after creation.
5. curl exit code 22 = HTTP >= 400 when using `--fail`.
6. YAML indentation must be exact in GitHub Actions.

---

# Current System State

- Ledger-based inventory tracking
- POS-driven theoretical depletion
- Reorder detection
- Shopping list generation
- Automated reorder email
- System logging
- Secure internal automation boundary
- Scheduled production cron

**System Status: Production Stable**

---

# Potential Next Improvements

- Health-check workflow (monitor if daily-run failed)
- Rate limiting on `/api/alert`
- Clerk middleware exclusion for `/api/inventory/*`
- Prep depletion alerts
- Admin monitoring dashboard
- Structured logging to external storage

---

# End of Document

```

```
