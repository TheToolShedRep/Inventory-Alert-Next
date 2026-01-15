// lib/purchases.ts
import { google } from "googleapis";

/**
 * ============================
 * ENV
 * ============================
 */
const SHEET_ID = process.env.SHEET_ID;
const PURCHASES_TAB = process.env.PURCHASES_TAB || "Purchases";
const CATALOG_TAB = process.env.CATALOG_TAB || "Catalog";
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

if (!SHEET_ID) throw new Error("Missing env: SHEET_ID");
if (!SERVICE_ACCOUNT_BASE64)
  throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

/**
 * ============================
 * Purchases row order (must match Purchases headers)
 * ============================
 */
export type PurchasesRowInput = {
  timestamp: string; // ISO
  entered_by: string;
  upc: string;
  product_name: string;
  brand?: string;
  size_unit?: string;
  google_category_id?: string;
  google_category_name?: string;
  qty_purchased: number;
  total_price: number;
  store_vendor: string;
  assigned_location: "Kitchen" | "Front";
  notes?: string;
};

/**
 * ============================
 * Catalog headers (must match your Catalog tab headers)
 * ============================
 * upc, product_name, brand, size_unit, google_category_id, google_category_name,
 * default_location, preferred_vendor, par_level, reorder_point, active, last_seen, notes
 */
export type CatalogUpsertInput = {
  upc: string;
  product_name: string;
  brand?: string;
  size_unit?: string;
  google_category_id?: string;
  google_category_name?: string;
  default_location?: string; // only set on insert usually
  preferred_vendor?: string; // only set on insert usually
  notes?: string;
};

/**
 * ============================
 * Sheets client (same style as lib/sheets.ts)
 * ============================
 */
function getSheetsClient() {
  const creds = JSON.parse(
    Buffer.from(SERVICE_ACCOUNT_BASE64!, "base64").toString("utf-8")
  );

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Append a row to Purchases tab.
 *
 * Purchases headers (row 1) should match this order:
 * timestamp, entered_by, upc, product_name, brand, size_unit,
 * google_category_id, google_category_name, qty_purchased, total_price,
 * unit_price, store_vendor, assigned_location, notes
 *
 * NOTE: unit_price should be calculated in Sheets (ARRAYFORMULA),
 * so we write "" in that slot.
 */
export async function appendPurchaseRow(input: PurchasesRowInput) {
  const sheets = getSheetsClient();

  const values = [
    [
      input.timestamp,
      input.entered_by,
      input.upc,
      input.product_name,
      input.brand ?? "",
      input.size_unit ?? "",
      input.google_category_id ?? "",
      input.google_category_name ?? "",
      input.qty_purchased,
      input.total_price,
      "", // unit_price calculated in Sheets
      input.store_vendor,
      input.assigned_location,
      input.notes ?? "",
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID!,
    range: `${PURCHASES_TAB}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Reads Catalog UPC column to find row number.
 * Assumes UPC is in column A and headers are in row 1.
 */
export async function findCatalogRowByUpc(upc: string) {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
    range: `${CATALOG_TAB}!A:A`,
  });

  const values = res.data.values || [];
  for (let i = 1; i < values.length; i++) {
    const cell = (values[i]?.[0] || "").toString().trim();
    if (cell === upc) return { found: true as const, rowNumber: i + 1 };
  }

  return { found: false as const, rowNumber: null as any };
}

/**
 * Upserts Catalog row for a UPC:
 * - If missing: inserts a new Catalog row
 * - If exists: updates key fields + last_seen, keeps defaults and par levels intact
 */
export async function upsertCatalogRow(params: CatalogUpsertInput) {
  const sheets = getSheetsClient();
  const { found, rowNumber } = await findCatalogRowByUpc(params.upc);

  const nowIso = new Date().toISOString();

  if (!found) {
    const newRow = [
      params.upc,
      params.product_name,
      params.brand ?? "",
      params.size_unit ?? "",
      params.google_category_id ?? "",
      params.google_category_name ?? "",
      params.default_location ?? "",
      params.preferred_vendor ?? "",
      "", // par_level
      "", // reorder_point
      "TRUE",
      nowIso, // last_seen
      params.notes ?? "",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID!,
      range: `${CATALOG_TAB}!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });

    return { action: "inserted" as const };
  }

  /**
   * Catalog column map based on your header order:
   * A upc
   * B product_name
   * C brand
   * D size_unit
   * E google_category_id
   * F google_category_name
   * G default_location (keep)
   * H preferred_vendor (keep)
   * I par_level (keep)
   * J reorder_point (keep)
   * K active (keep)
   * L last_seen (update)
   * M notes (keep)
   */

  // Update B-F (product identity fields)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID!,
    range: `${CATALOG_TAB}!B${rowNumber}:F${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          params.product_name,
          params.brand ?? "",
          params.size_unit ?? "",
          params.google_category_id ?? "",
          params.google_category_name ?? "",
        ],
      ],
    },
  });

  // Update last_seen (column L)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID!,
    range: `${CATALOG_TAB}!L${rowNumber}:L${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[nowIso]] },
  });

  return { action: "updated" as const };
}
