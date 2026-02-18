// src/lib/auth/internal.ts
import { NextResponse } from "next/server";

/**
 * Simple internal-key gate.
 * Protects endpoints that should only be callable by your cron / server-side jobs.
 */
export function requireInternalKey(req: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  const key = req.headers.get("x-api-key");

  // If env isn't set, fail closed (safer than accidentally leaving prod open)
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: INTERNAL_API_KEY missing" },
      { status: 500 },
    );
  }

  if (key !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null; // allowed
}
