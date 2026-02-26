// lib/sheets/read.ts
import { google } from "googleapis";
import { getSheetsAuth } from "./auth";

const sheets = google.sheets("v4");

export async function readTabAsObjects(tabName: string) {
  // ✅ FIX: use SHEET_ID as primary; fallback to GOOGLE_SHEET_ID for backward compatibility
  const spreadsheetId = process.env.SHEET_ID || process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId)
    throw new Error("Missing env: SHEET_ID (or GOOGLE_SHEET_ID)");

  const auth = getSheetsAuth();

  const res = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId,
    range: `${tabName}!A1:Z`,
  });

  const values = res.data.values || [];
  if (values.length === 0) return { headers: [], rows: [] };

  const headers = values[0] || [];
  const rows = values.slice(1);

  const objects = rows.map((r) => {
    const obj: Record<string, any> = {};
    headers.forEach((h: string, idx: number) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });

  return { headers, rows: objects };
}
