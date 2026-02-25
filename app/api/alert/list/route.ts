import { NextResponse } from "next/server";
import { getAllAlerts } from "@/lib/sheets-core";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await getAllAlerts();

    return NextResponse.json({
      ok: true,
      count: rows.length,
      rows,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "List failed" },
      { status: 500 },
    );
  }
}
