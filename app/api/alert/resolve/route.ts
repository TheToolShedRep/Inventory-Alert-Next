// app/api/alert/resolve/route.ts
import { NextResponse } from "next/server";
import { resolveAlertById } from "@/lib/sheets-core";

export const runtime = "nodejs";

export async function POST(req: Request) {
  console.log("✅ /api/alert/resolve HIT", new Date().toISOString());

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

    const alertId = String(body.alertId || "").trim();
    if (!alertId) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: alertId" },
        { status: 400 },
      );
    }

    console.log("➡️ Resolving alert:", alertId);

    const ok = await resolveAlertById(alertId);

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Alert not found (no row matched alert_id)" },
        { status: 404 },
      );
    }

    console.log("✅ Resolved OK:", alertId);
    return NextResponse.json({ ok: true, alertId });
  } catch (e: any) {
    console.error("❌ POST /api/alert/resolve failed:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 },
    );
  }
}
