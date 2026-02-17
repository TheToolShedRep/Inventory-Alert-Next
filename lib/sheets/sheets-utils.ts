// lib/sheets/sheets-utils.ts
import { google } from "googleapis";
import { getSheetsAuth } from "./auth";

const sheets = google.sheets("v4");

/**
 * Append ONE row using header-driven mapping.
 * Safe against column reordering (as long as headers stay the same).
 */
export async function appendRowHeaderDriven({
  tabName,
  rowObject,
}: {
  tabName: string;
  rowObject: Record<string, any>;
}) {
  const auth = getSheetsAuth();

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");

  const headerRes = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId,
    range: `${tabName}!1:1`,
  });

  const headers = headerRes.data.values?.[0];
  if (!headers || headers.length === 0) {
    throw new Error(`No headers found in sheet tab: ${tabName}`);
  }

  const row = headers.map((h) => rowObject[h] ?? "");

  await sheets.spreadsheets.values.append({
    auth,
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });

  return { ok: true, tab: tabName, columns: headers.length };
}

/**
 * Append MANY rows using header-driven mapping.
 * Useful for pipelines like Inventory_Math where we want to write a batch at once.
 */
export async function appendRowsHeaderDriven({
  tabName,
  rowObjects,
}: {
  tabName: string;
  rowObjects: Record<string, any>[];
}) {
  const auth = getSheetsAuth();

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");

  // Read headers once
  const headerRes = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId,
    range: `${tabName}!1:1`,
  });

  const headers = headerRes.data.values?.[0];
  if (!headers || headers.length === 0) {
    throw new Error(`No headers found in sheet tab: ${tabName}`);
  }

  // Build a 2D array (values matrix) in header order
  const values = rowObjects.map((obj) => headers.map((h) => obj[h] ?? ""));

  await sheets.spreadsheets.values.append({
    auth,
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  return {
    ok: true,
    tab: tabName,
    rows_written: rowObjects.length,
    columns: headers.length,
  };
}
