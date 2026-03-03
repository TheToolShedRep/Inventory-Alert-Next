// app/api/calibration/log/route.ts
import { NextResponse } from "next/server";
import { appendCalibrationLog, getBusinessDateNY } from "@/lib/sheets-core";
import { requireInternalKey } from "@/lib/auth/internal";

export const runtime = "nodejs";

/**
 * POST /api/calibration/log
 *
 * Body:
 * {
 *   upc: string,
 *   calibration_type: string,       // ex: "reorder_point" | "par_level" | "count" | etc
 *   before_value?: string|number,
 *   after_value?: string|number,
 *   delta?: number|string,          // optional
 *   reason?: string,
 *   actor?: string,
 *   business_date?: string          // optional YYYY-MM-DD; defaults to business date NY
 *   request_id?: string             // optional; generated if omitted
 * }
 *
 * Writes an append-only row to Calibration_Log.
 * Never overwrites. Safe for ledger history.
 */
export async function POST(req: Request) {
  // Protect this endpoint (same pattern as your other internal endpoints)
  const deny = requireInternalKey(req);
  if (deny) return deny;

  try {
    const raw = await req.text();
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing JSON body" },
        { status: 400 },
      );
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const upc = String(body.upc ?? "").trim();
    const calibration_type = String(body.calibration_type ?? "").trim();

    if (!upc) {
      return NextResponse.json(
        { ok: false, error: "Missing upc" },
        { status: 400 },
      );
    }
    if (!calibration_type) {
      return NextResponse.json(
        { ok: false, error: "Missing calibration_type" },
        { status: 400 },
      );
    }

    const business_date = body.business_date
      ? String(body.business_date).trim()
      : getBusinessDateNY();

    // NOTE: We don't require before/after; calibration might be “logged” even if
    // a value is unknown at the time.
    const before_value = body.before_value ?? "";
    const after_value = body.after_value ?? "";

    // delta can be empty, but if present and not numeric, store as string
    const deltaRaw = body.delta;
    const delta =
      deltaRaw === undefined || deltaRaw === null
        ? ""
        : typeof deltaRaw === "number"
          ? deltaRaw
          : String(deltaRaw);

    const reason = body.reason ? String(body.reason).trim() : "";
    const actor = body.actor ? String(body.actor).trim() : "";

    // Useful for tracing (one calibration click can write multiple logs)
    const request_id =
      body.request_id && String(body.request_id).trim()
        ? String(body.request_id).trim()
        : `cal_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    await appendCalibrationLog({
      upc,
      calibration_type,
      before_value,
      after_value,
      delta,
      reason,
      actor,
      business_date,
      request_id,
    });

    return NextResponse.json({
      ok: true,
      scope: "calibration-log",
      upc,
      calibration_type,
      business_date,
      request_id,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
