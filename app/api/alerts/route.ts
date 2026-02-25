import { NextResponse } from "next/server";
import { getAllAlerts } from "@/lib/sheets-core";

export const runtime = "nodejs";

export async function GET() {
  const rows = await getAllAlerts();
  return NextResponse.json({
    ok: true,
    scope: "alerts",
    count: rows.length,
    rows,
  });
}
