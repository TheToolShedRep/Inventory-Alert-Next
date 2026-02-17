// lib/purchases.ts
import { google } from "googleapis";
import { appendRowHeaderDriven } from "@/lib/sheets/sheets-utils";

/**
 * ============================
 * ENV
 * ============================
 */
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const PURCHASES_TAB = process.env.PURCHASES_TAB || "Purchases";
const CATALOG_TAB = process.env.CATALOG_TAB || "Catalog";
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

if (!GOOGLE_SHEET_ID) throw new Error("Missing env: GOOGLE_SHEET_ID");
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
 * Sheets client
 * ============================
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
 * Convert a 0-based column index into an A1 column letter.
 * Works for A..Z (0..25). Your Catalog is within this range.
 */
function colIndexToLetter(idx: number) {
  if (idx < 0 || idx > 25) {
    throw new Error(
      `Column index ${idx} out of supported range (A..Z). Expand helper if needed.`,
    );
  }
  return String.fromCharCode("A".charCodeAt(0) + idx);
}

/**
 * Update a single cell in Catalog by looking up the column via header name.
 * This prevents breakage when columns are re-ordered in Sheets.
 */
async function updateCatalogCellByHeader({
  sheets,
  rowNumber,
  headerName,
  value,
}: {
  sheets: ReturnType<typeof getSheetsClient>;
  rowNumber: number;
  headerName: string;
  value: string;
}) {
  // Read header row only (fast)
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${CATALOG_TAB}!1:1`,
  });

  const header = (headerRes.data.values?.[0] || []).map((h) =>
    (h || "").toString().trim().toLowerCase(),
  );

  const idx = header.findIndex((h) => h === headerName.toLowerCase());
  if (idx === -1) throw new Error(`Catalog missing header: ${headerName}`);

  const colLetter = colIndexToLetter(idx);

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${CATALOG_TAB}!${colLetter}${rowNumber}:${colLetter}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });
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
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${PURCHASES_TAB}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Reads Catalog UPC column to find row number.
 * Assumes UPC is in column A and headers are in row 1.
 *
 * NOTE: If you ever move UPC off column A, we can make this header-driven too.
 */
export async function findCatalogRowByUpc(upc: string) {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
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
 * - If missing: inserts a new Catalog row (header-driven)
 * - If exists: updates key fields + last_seen (last_seen is header-driven)
 *
 * IMPORTANT:
 * - Inserts are fully header-driven.
 * - last_seen updates are header-driven so column re-ordering won't break.
 * - B:F update is still range-based; keep those identity fields in the same order
 *   OR we can convert that part too later.
 */
export async function upsertCatalogRow(params: CatalogUpsertInput) {
  const sheets = getSheetsClient();
  const { found, rowNumber } = await findCatalogRowByUpc(params.upc);

  const nowIso = new Date().toISOString();

  if (!found) {
    await appendRowHeaderDriven({
      tabName: CATALOG_TAB,
      rowObject: {
        upc: params.upc,
        product_name: params.product_name,
        brand: params.brand ?? "",
        size_unit: params.size_unit ?? "",
        google_category_id: params.google_category_id ?? "",
        google_category_name: params.google_category_name ?? "",
        default_location: params.default_location ?? "",
        preferred_vendor: params.preferred_vendor ?? "",
        par_level: "",
        reorder_point: "",
        active: "TRUE",
        last_seen: nowIso,
        notes: params.notes ?? "",

        // Optional columns in your Catalog
        purchase_unit: "",
        base_unit: "",
        units_per_purchase_unit: "",
      },
    });

    return { action: "inserted" as const };
  }

  // Update product identity fields (range-based)
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID!,
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

  // Update last_seen (header-driven, no hard-coded column letters)
  await updateCatalogCellByHeader({
    sheets,
    rowNumber,
    headerName: "last_seen",
    value: nowIso,
  });

  return { action: "updated" as const };
}

/**
 * Returns smart defaults from Catalog for a UPC:
 * - default_location
 * - preferred_vendor
 *
 * NOTE:
 * We read the header row and find the column indexes dynamically so your sheet can move columns.
 */
export async function getCatalogDefaultsByUpc(upc: string): Promise<{
  defaultLocation?: "Kitchen" | "Front";
  preferredVendor?: string;
}> {
  const sheets = getSheetsClient();

  // Read A:Z so we can locate columns by header name.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${CATALOG_TAB}!A:Z`,
  });

  const values = res.data.values || [];
  if (values.length <= 1) return {};

  const header = (values[0] || []).map((h) => (h || "").toString().trim());

  // Find columns by header labels (snake_case per your sheet plan)
  const upcIdx = header.findIndex((h) => h.toLowerCase() === "upc");
  const defaultLocIdx = header.findIndex(
    (h) => h.toLowerCase() === "default_location",
  );
  const vendorIdx = header.findIndex(
    (h) => h.toLowerCase() === "preferred_vendor",
  );

  if (upcIdx === -1) return {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const rowUpc = (row[upcIdx] || "").toString().trim();
    if (rowUpc !== upc) continue;

    const defaultLoc =
      defaultLocIdx >= 0 ? (row[defaultLocIdx] || "").toString().trim() : "";
    const vendor =
      vendorIdx >= 0 ? (row[vendorIdx] || "").toString().trim() : "";

    const normalizedLoc =
      defaultLoc === "Kitchen"
        ? "Kitchen"
        : defaultLoc === "Front"
          ? "Front"
          : undefined;

    return {
      defaultLocation: normalizedLoc,
      preferredVendor: vendor || undefined,
    };
  }

  return {};
}
