import { NextResponse } from "next/server";
import { getShoppingList, getBusinessDateNY } from "@/lib/sheets-core";
import { google } from "googleapis";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const started = Date.now();

  try {
    const url = new URL(req.url);
    const includeHidden = url.searchParams.get("includeHidden") === "1";

    const businessDate = getBusinessDateNY();

    // ✅ TEMP DEBUG: which sheet id is this route using?
    const debugSheetId = process.env.GOOGLE_SHEET_ID || "";

    // ✅ TEMP DEBUG: RAW read of Shopping_List directly (bypasses getShoppingList)
    const SERVICE_ACCOUNT_BASE64 =
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!;
    const creds = JSON.parse(
      Buffer.from(SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8"),
    );

    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const raw = await sheets.spreadsheets.values.get({
      spreadsheetId: debugSheetId!,
      range: `Shopping_List!A:K`,
    });

    const rawValues = raw.data.values || [];
    const rawRowCount = rawValues.length; // includes header if present
    const rawSample = rawValues.slice(0, 5);

    const rows = await getShoppingList({ includeHidden });

    return NextResponse.json({
      ok: true,
      scope: "shopping-list",
      businessDate,
      includeHidden,
      ms: Date.now() - started,
      count: rows.length,
      rows,
      debug_sheet_id: debugSheetId,
      debug_raw_row_count: rawRowCount,
      debug_raw_sample: rawSample,
    });
  } catch (err: any) {
    console.error("❌ /api/shopping-list error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load shopping list" },
      { status: 500 },
    );
  }
}
