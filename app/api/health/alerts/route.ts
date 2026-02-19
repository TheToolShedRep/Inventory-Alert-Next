// app/api/health/alerts/route.ts
import { NextResponse } from "next/server";
import { getTodayAlerts } from "@/lib/sheets-core";

export const runtime = "nodejs";

/**
 * ✅ Alerts Integrity Endpoint
 * Purpose:
 * - Quick "is the pipeline healthy?" check
 * - Useful for admin UI, cron checks, debugging, and multi-client reuse
 *
 * Returns:
 * - counts for today (business-local day)
 * - ok = true if the endpoint can read data and respond
 */
export async function GET() {
  const started = Date.now();

  try {
    const alerts = await getTodayAlerts();

    const counts = alerts.reduce(
      (acc, a) => {
        acc.total += 1;
        if (a.status === "active") acc.active += 1;
        else if (a.status === "resolved") acc.resolved += 1;
        else if (a.status === "canceled") acc.canceled += 1;
        return acc;
      },
      { total: 0, active: 0, resolved: 0, canceled: 0 },
    );

    return NextResponse.json({
      ok: true,
      scope: "alerts",
      ms: Date.now() - started,
      counts,
      sample: alerts.slice(0, 3).map((a) => ({
        timestamp: a.timestamp,
        item: a.item,
        location: a.location,
        qty: a.qty,
        status: a.status,
        source: a.source || "legacy",
        alertId: a.alertId || null,
      })),
    });
  } catch (e: any) {
    console.error("❌ /api/health/alerts failed:", e?.message || e);
    return NextResponse.json(
      {
        ok: false,
        scope: "alerts",
        ms: Date.now() - started,
        error: String(e?.message || e),
      },
      { status: 500 },
    );
  }
}
