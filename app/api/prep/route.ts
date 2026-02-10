// app/api/prep/route.ts
import { NextResponse } from "next/server";
import { logPrepToSheet } from "@/lib/sheets/prep";

export async function POST(req: Request) {
  const started = Date.now();

  try {
    const body = await req.json();

    const date = String(body.date || "");
    const menu_item = String(body.menu_item || "");
    const menu_qty = Number(body.menu_qty);

    if (!date || !menu_item || !Number.isFinite(menu_qty)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing or invalid fields: date, menu_item, menu_qty",
        },
        { status: 400 },
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";

    const user_agent = req.headers.get("user-agent") || "";

    const result = await logPrepToSheet({
      date,
      menu_item,
      menu_qty,
      ingredient: body.ingredient ? String(body.ingredient) : undefined,
      qty_used: body.qty_used != null ? Number(body.qty_used) : undefined,
      unit: body.unit ? String(body.unit) : undefined,
      cost: body.cost != null ? Number(body.cost) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      source: body.source ? String(body.source) : "prep",
      ip,
      user_agent,
    });

    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}
