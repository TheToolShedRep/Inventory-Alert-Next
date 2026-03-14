// app/api/admin/archive-sales/route.ts
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireInternalKey } from "@/lib/auth/internal";

export const runtime = "nodejs";

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

if (!GOOGLE_SHEET_ID) throw new Error("Missing env: GOOGLE_SHEET_ID");
if (!SERVICE_ACCOUNT_BASE64) {
  throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
}

function getSheetsClient() {
  const creds = JSON.parse(
    Buffer.from(SERVICE_ACCOUNT_BASE64!, "base64").toString("utf-8"),
  );

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function subtractDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function GET(req: Request) {
  const deny = requireInternalKey(req);
  if (deny) return deny;

  const started = Date.now();

  try {
    const url = new URL(req.url);
    const keepDays = Number(url.searchParams.get("keepDays") || "90");
    const salesTab = process.env.SALES_TAB || "Sales";
    const archiveTab = process.env.SALES_ARCHIVE_TAB || "Sales_Archive";

    const cutoffDate = ymd(subtractDays(keepDays));
    const sheets = getSheetsClient();

    // 1) Read current Sales data
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID!,
      range: `${salesTab}!A:E`,
    });

    const values = readRes.data.values || [];

    if (values.length === 0) {
      return NextResponse.json({
        ok: true,
        scope: "archive-sales",
        message: "Sales sheet is empty",
        keepDays,
        cutoffDate,
        ms: Date.now() - started,
      });
    }

    const header = values[0];
    const rows = values.slice(1);

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        scope: "archive-sales",
        message: "No data rows to archive",
        keepDays,
        cutoffDate,
        ms: Date.now() - started,
      });
    }

    // 2) Split rows into archive vs keep
    const rowsToArchive: string[][] = [];
    const rowsToKeep: string[][] = [];

    for (const row of rows) {
      const rowDate = String(row[0] || "").trim(); // column A = date

      if (rowDate && rowDate < cutoffDate) {
        rowsToArchive.push(row);
      } else {
        rowsToKeep.push(row);
      }
    }

    if (rowsToArchive.length === 0) {
      return NextResponse.json({
        ok: true,
        scope: "archive-sales",
        keepDays,
        cutoffDate,
        archived_rows: 0,
        kept_rows: rowsToKeep.length,
        ms: Date.now() - started,
      });
    }

    // 3) Append old rows to Sales_Archive
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID!,
      range: `${archiveTab}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rowsToArchive,
      },
    });

    // 4) Replace Sales with header + kept rows only
    await sheets.spreadsheets.values.clear({
      spreadsheetId: GOOGLE_SHEET_ID!,
      range: `${salesTab}!A:E`,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: GOOGLE_SHEET_ID!,
      range: `${salesTab}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [header, ...rowsToKeep],
      },
    });

    return NextResponse.json({
      ok: true,
      scope: "archive-sales",
      keepDays,
      cutoffDate,
      archived_rows: rowsToArchive.length,
      kept_rows: rowsToKeep.length,
      archive_tab: archiveTab,
      sales_tab: salesTab,
      ms: Date.now() - started,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "archive-sales",
        error: err?.message || "Archive failed",
      },
      { status: 500 },
    );
  }
}
