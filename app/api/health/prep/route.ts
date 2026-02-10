// app/api/health/prep/route.ts
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getSheetsAuth } from "@/lib/sheets/auth";

const sheets = google.sheets("v4");

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function GET() {
  const started = Date.now();

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");

    const auth = getSheetsAuth();

    // Read the entire Prep sheet (good enough for now; later we can optimize ranges)
    const res = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range: "Prep!A1:Z",
    });

    const values = res.data.values || [];
    const headers = values[0] || [];
    const rows = values.slice(1);

    // Find useful column indexes (header-driven)
    const idx = (name: string) => headers.indexOf(name);

    const iDate = idx("date");
    const iMenu = idx("menu_item");
    const iQty = idx("menu_qty");
    const iSource = idx("source");

    const isRealRow = (r: any[]) => {
      const menu = iMenu >= 0 ? String(r[iMenu] || "").trim() : "";
      const qty = iQty >= 0 ? String(r[iQty] || "").trim() : "";
      return menu.length > 0 || qty.length > 0;
    };

    const realRows = rows.filter(isRealRow);
    const total = realRows.length;

    // Count sources (optional)
    const bySource: Record<string, number> = {};
    for (const r of rows) {
      const s = iSource >= 0 ? r[iSource] || "legacy" : "legacy";
      bySource[s] = (bySource[s] || 0) + 1;
    }

    // Sample mapping (safe even if columns missing)
    const sample = rows.slice(0, 3).map((r) => ({
      date: iDate >= 0 ? (r[iDate] ?? "") : "",
      menu_item: iMenu >= 0 ? (r[iMenu] ?? "") : "",
      menu_qty: iQty >= 0 ? (r[iQty] ?? "") : "",
      source: iSource >= 0 ? (r[iSource] ?? "legacy") : "legacy",
    }));

    return NextResponse.json({
      ok: true,
      scope: "prep",
      ms: Date.now() - started,
      counts: {
        total,
        bySource,
      },
      headers,
      sample,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, scope: "prep", error: err?.message || "Server error" },
      { status: 500 },
    );
  }
}
