// app/api/health/sheets/route.ts
import { NextResponse } from "next/server";
import { getAllAlerts } from "@/lib/sheets-core";

export async function GET() {
  const started = Date.now();

  try {
    const alerts = await getAllAlerts();

    const counts = {
      total: alerts.length,
      active: alerts.filter((a) => a.status === "active").length,
      resolved: alerts.filter((a) => a.status === "resolved").length,
      canceled: alerts.filter((a) => a.status === "canceled").length,
    };

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
    console.error("❌ /api/health/sheets failed", e);

    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Sheets health check failed",
      },
      { status: 500 },
    );
  }
}
