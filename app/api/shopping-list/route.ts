// app/api/shopping-list/route.ts
import { NextResponse } from "next/server";
import { getShoppingList, getBusinessDateNY } from "@/lib/sheets-core";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const started = Date.now();

  try {
    const url = new URL(req.url);
    const includeHidden = url.searchParams.get("includeHidden") === "1";

    const businessDate = getBusinessDateNY();
    const rows = await getShoppingList({ includeHidden });

    return NextResponse.json({
      ok: true,
      scope: "shopping-list",
      businessDate,
      includeHidden,
      ms: Date.now() - started,
      count: rows.length,
      rows,
    });
  } catch (err: any) {
    console.error("❌ /api/shopping-list error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load shopping list" },
      { status: 500 },
    );
  }
}
