// app/manager.csv/route.ts
import { NextResponse } from "next/server";
import { getTodayManagerAlerts } from "@/lib/sheets-core";
import { csvEscape } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    // ✅ active + resolved (excludes canceled)
    const alerts = await getTodayManagerAlerts();

    const header = [
      "timestamp",
      "item",
      "qty",
      "location",
      "note",
      "ip",
      "user_agent",
      "status",
      "alert_id",
      "canceled_at",
      "resolved_at", // ✅ NEW
    ];

    const lines = [
      header.join(","),
      ...alerts.map((a) =>
        [
          csvEscape(a.timestamp),
          csvEscape(a.item),
          csvEscape(a.qty),
          csvEscape(a.location),
          csvEscape(a.note),
          csvEscape(a.ip),
          csvEscape(a.userAgent),
          csvEscape(a.status),
          csvEscape(a.alertId),
          csvEscape(a.canceledAt),
          csvEscape(a.resolvedAt), // ✅ NEW
        ].join(","),
      ),
    ];

    const csv = lines.join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="manager-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    console.error("GET /manager.csv failed:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 },
    );
  }
}
