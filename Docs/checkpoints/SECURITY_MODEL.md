# Document 3: `SECURITY_MODEL.md`

---

# Inventory Alert System

## Security Model

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Production Hardened

---

# Purpose

This document defines:

- The system’s security boundaries
- Public vs private API surface
- Secret handling model
- Threat assumptions
- Risk mitigation strategies
- Why certain architectural decisions were made

This is the formal explanation of how the system is protected.

---

# Security Philosophy

The system follows five principles:

1. **Fail Closed**
2. **Minimize Public Surface**
3. **Separate Automation from User Traffic**
4. **Keep Secrets Off the Client**
5. **Audit Everything**

Security is intentionally simple, layered, and explicit.

---

# Public vs Private Surface

## Public Endpoints

These must remain accessible without authentication:

- `/api/alert` (QR scan + memo mode)

Reason:
Staff must quickly report low inventory without login friction.

---

## Private (Protected) Endpoints

These require `x-api-key` header:

- `/api/inventory/daily-run`
- `/api/inventory-math/run`
- `/api/inventory/reorder-check`
- `/api/inventory/reorder-email`
- `/api/purchase`

These endpoints:

- Modify inventory state
- Trigger email
- Write shopping lists
- Control automation

They are never intended for public browser use.

---

# Internal API Key Model

## Mechanism

Each protected endpoint begins with:

```ts
const deny = requireInternalKey(req);
if (deny) return deny;
```

The gate checks:

```ts
req.headers.get("x-api-key");
```

Against:

```ts
process.env.INTERNAL_API_KEY;
```

---

## Why Header-Based Instead of Clerk?

Reasons:

- These are machine-to-machine calls.
- GitHub Actions does not authenticate with Clerk.
- We want deterministic server-only access.
- Simpler surface, lower overhead.

This is an automation boundary, not user authentication.

---

# Secret Storage Locations

## Production

Secrets stored in:

- Render Environment Variables
- GitHub Repository Secrets

## Development

Stored in:

```
.env.local
```

Ignored by Git.

---

# What Is Never Exposed

- INTERNAL_API_KEY
- GOOGLE_PRIVATE_KEY
- RESEND_API_KEY
- Service account credentials

These are never:

- Logged
- Sent to client
- Returned in JSON
- Stored in frontend code

---

# Threat Model

We assume:

- Public users can hit any public endpoint.
- Bots can scan the domain.
- Anyone can attempt to call `/api/inventory/*`.
- Secrets may be leaked if committed accidentally.

We do NOT assume:

- Full nation-state adversaries.
- Dedicated penetration attacks.
- Internal malicious actors (low likelihood).

---

# Attack Vectors Considered

---

## 1️ Direct Endpoint Abuse

Without protection, someone could:

```
GET /api/inventory/reorder-email
```

And spam reorder emails.

Mitigation:
Internal API key required.

---

## 2️⃣ Inventory Manipulation

Attacker could:

```
POST /api/purchase
```

And artificially inflate stock.

Mitigation:
Protected with key gate.

---

## 3️⃣ Email Abuse (Resend Quota Burn)

Attacker triggers repeated reorder-email.

Mitigation:
Endpoint protected.

---

## 4️⃣ Secret Leakage via Git

Mitigation:

- `.env.local` in `.gitignore`
- Production secrets never stored in repo
- GitHub Secrets used for automation

---

## 5️⃣ Misconfiguration (Fail Open)

If INTERNAL_API_KEY missing, gate returns:

```
500 Server misconfigured
```

System fails closed.

This prevents accidental public exposure.

---

# Secret Rotation Strategy

If key compromise suspected:

1. Generate new key:

   ```
   openssl rand -hex 32
   ```

2. Update in Render.
3. Update in GitHub.
4. Restart Render.
5. Test manually.
6. Confirm GitHub workflow passes.

Old key becomes invalid immediately.

---

# Logging for Security Audit

System_Log captures:

- Daily-run execution
- Email send status
- Items flagged
- Duration

Provides detection for:

- Unexpected spikes
- Email failures
- Automation misuse

---

# Why Not JWT or OAuth?

Because:

- No user roles yet.
- No multi-tenant model.
- No external integrations.
- System runs as single-tenant internal automation.

Header key is sufficient for current threat level.

Can evolve later if needed.

---

# Future Security Enhancements (Optional)

- Rate limiting on `/api/alert`
- IP logging for abuse detection
- Clerk-based admin dashboard
- Signed webhook validation if vendor APIs added
- Moving to role-based auth if multi-location scaling

---

# Security Boundary Diagram

```
Public Internet
      ↓
Render App
      ↓
---------------------------------
| Public: /api/alert           |
---------------------------------
| Protected: /api/inventory/*  |
| Protected: /api/purchase     |
---------------------------------
      ↓
Google Sheets + Resend
```

---

# Security State (As of 2026-02-18)

- Automation endpoints protected
- Secrets properly stored
- Cron secured
- Production verified
- System fails closed
- Public surface minimized

System classified as:

**Low Complexity / Controlled Exposure / Production Hardened**

---

# End of Document
