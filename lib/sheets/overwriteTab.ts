// lib/sheets/overwriteTab.ts
import { google } from "googleapis";

// ✅ FIX: use SHEET_ID as primary; fallback to GOOGLE_SHEET_ID for backward compatibility
const GOOGLE_SHEET_ID = process.env.SHEET_ID || process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

if (!GOOGLE_SHEET_ID)
  throw new Error("Missing env: SHEET_ID (or GOOGLE_SHEET_ID)");
if (!SERVICE_ACCOUNT_BASE64)
  throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

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

/**
 * Overwrites an entire tab with provided header + rows (2D values).
 */
export async function overwriteTabValues({
  tabName,
  header,
  rows,
}: {
  tabName: string;
  header: string[];
  rows: any[][];
}) {
  const sheets = getSheetsClient();

  // Clear the tab
  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${tabName}!A:Z`,
  });

  // Write header + rows
  const values = [header, ...rows];

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}
