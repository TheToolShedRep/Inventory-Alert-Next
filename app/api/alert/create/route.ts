import { NextResponse } from "next/server";
import { createAlert } from "@/lib/sheets-core";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const alertId = await createAlert(body);

    return NextResponse.json({
      ok: true,
      alertId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Create failed" },
      { status: 500 },
    );
  }
}
