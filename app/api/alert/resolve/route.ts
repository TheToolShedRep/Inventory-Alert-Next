// app/api/alert/resolve/route.ts
import { NextResponse } from "next/server";
import { resolveAlertById } from "@/lib/sheets";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const alertId = String(body?.alertId || "").trim();

    if (!alertId) {
      return NextResponse.json(
        { ok: false, error: "Missing alertId" },
        { status: 400 }
      );
    }

    const ok = await resolveAlertById(alertId);

    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Alert not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("POST /api/alert/resolve failed:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
