// lib/sales.ts
// ---------------------------------------------// Toast → Sales (Google Sheets) helpers
// - appendSalesRows(): appends daily sales rows into the Sales tab
// - clearSalesRowsForDate(): deletes existing rows for a given date+source so sync is idempotent
// ---------------------------------------------

import { google } from "googleapis";

/**
 * ============================
 * ENV
 * ============================
 * Required:
 *  - SHEET_ID
 *  - GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
 *
 * Optional:
 *  - SALES_TAB (defaults to "Sales")
 */
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
const SALES_TAB = process.env.SALES_TAB || "Sales";

if (!GOOGLE_SHEET_ID) throw new Error("Missing env: SHEET_ID");
if (!SERVICE_ACCOUNT_BASE64) {
  throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
}

/**
 * Create an authenticated Sheets client.
 */
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
 * Append sales rows to the Sales tab.
 *
 * EXPECTED Sales headers (row 1):
 * A: date        (YYYY-MM-DD)
 * B: menu_item
 * C: qty_sold
 * D: source      ("toast")
 * E: synced_at   (ISO timestamp)
 */
export async function appendSalesRows(
  rows: Array<{
    date: string; // YYYY-MM-DD
    menu_item: string;
    qty_sold: number;
    source?: string; // default "toast"
    synced_at?: string; // ISO timestamp
  }>,
) {
  const sheets = getSheetsClient();
  const nowIso = new Date().toISOString();

  const values = rows.map((r) => [
    r.date,
    r.menu_item,
    r.qty_sold,
    r.source || "toast",
    r.synced_at || nowIso,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${SALES_TAB}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Delete existing Sales rows for a given date + source.
 *
 * Why this exists:
 * - Your /api/toast/sales-sync route can run multiple times per day.
 * - Without this, you would append duplicates each run.
 *
 * This makes the sync idempotent:
 *   clearSalesRowsForDate(date) -> appendSalesRows(fresh data)
 */
export async function clearSalesRowsForDate(params: {
  date: string; // YYYY-MM-DD
  source?: string; // default "toast"
}) {
  const sheets = getSheetsClient();
  const source = params.source || "toast";

  // Read existing Sales rows (A:E).
  // We only need columns: A=date and D=source to find matching rows.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${SALES_TAB}!A:E`,
  });

  const values = res.data.values || [];

  // If only header row exists, nothing to clear.
  if (values.length <= 1) return { cleared: 0 };

  // Header is row 1; data starts row 2.
  // Find rows where (A == date AND D == source).
  const rowsToDelete: number[] = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const rowDate = (row[0] || "").toString().trim(); // Col A
    const rowSource = (row[3] || "").toString().trim(); // Col D

    if (rowDate === params.date && rowSource === source) {
      rowsToDelete.push(i + 1); // Convert to 1-indexed Sheets row number
    }
  }

  if (rowsToDelete.length === 0) return { cleared: 0 };

  // To delete rows we need the numeric sheetId for the Sales tab.
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
  });

  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === SALES_TAB,
  );

  const sheetId = sheet?.properties?.sheetId;
  if (sheetId == null) {
    throw new Error(`Could not find sheetId for tab ${SALES_TAB}`);
  }

  // Delete from bottom up so indexes don't shift as we delete.
  rowsToDelete.sort((a, b) => b - a);

  const requests = rowsToDelete.map((rowNumber) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: rowNumber - 1, // 0-indexed inclusive
        endIndex: rowNumber, // 0-indexed exclusive
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID!,
    requestBody: { requests },
  });

  return { cleared: rowsToDelete.length };
}
