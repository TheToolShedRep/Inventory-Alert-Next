// app/api/inventory/adjust/route.ts
import { NextResponse } from "next/server";
import { appendInventoryAdjustment } from "@/lib/sheets-core";
import { requireInternalKey } from "@/lib/auth/internal";

export const runtime = "nodejs";

/**
 * POST /api/inventory/adjust
 *
 * Body:
 * {
 *   upc: string,
 *   base_units_delta: number,          // can be negative (ex: -3)
 *   adjustment_type?: string,          // ex: "count", "spoilage", "waste"
 *   reason?: string,
 *   actor?: string,
 *   date?: string                      // optional YYYY-MM-DD, defaults to business date NY
 * }
 *
 * Writes an append-only row to Inventory_Adjustments.
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

    // Required fields
    const upc = String(body.upc ?? "").trim();
    if (!upc) {
      return NextResponse.json(
        { ok: false, error: "Missing upc" },
        { status: 400 },
      );
    }

    const base_units_delta = Number(body.base_units_delta);
    if (!Number.isFinite(base_units_delta)) {
      return NextResponse.json(
        { ok: false, error: "base_units_delta must be a number" },
        { status: 400 },
      );
    }

    // Optional fields
    const date = body.date ? String(body.date).trim() : undefined; // validate in sheets-core.ts
    const adjustment_type = body.adjustment_type
      ? String(body.adjustment_type).trim()
      : "adjust";
    const reason = body.reason ? String(body.reason).trim() : "";
    const actor = body.actor ? String(body.actor).trim() : "";

    // Append to Inventory_Adjustments ledger
    await appendInventoryAdjustment({
      date,
      upc,
      base_units_delta,
      adjustment_type,
      reason,
      actor,
    });

    return NextResponse.json({
      ok: true,
      scope: "inventory-adjust",
      upc,
      base_units_delta,
      date: date ?? "(default business date)",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
