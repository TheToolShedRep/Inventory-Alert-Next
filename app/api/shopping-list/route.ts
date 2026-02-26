import { NextResponse } from "next/server";
import { getShoppingList, getBusinessDateNY } from "@/lib/sheets-core";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const started = Date.now();

  try {
    const url = new URL(req.url);
    const includeHidden = url.searchParams.get("includeHidden") === "1";

    const businessDate = getBusinessDateNY();

    // ✅ TEMP DEBUG: which sheet id is this route using?
    const debugSheetId = process.env.SHEET_ID || process.env.GOOGLE_SHEET_ID;

    const rows = await getShoppingList({ includeHidden });

    return NextResponse.json({
      ok: true,
      scope: "shopping-list",
      businessDate,
      includeHidden,
      ms: Date.now() - started,
      count: rows.length,
      rows,
      debug_sheet_id: debugSheetId, // ✅ TEMP DEBUG
    });
  } catch (err: any) {
    console.error("❌ /api/shopping-list error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load shopping list" },
      { status: 500 },
    );
  }
}
