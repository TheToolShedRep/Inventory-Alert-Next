// lib/sheets-core.ts
import { google } from "googleapis";
import { unstable_cache } from "next/cache";
// import type { sheets_v4 } from "googleapis";
import { appendRowHeaderDriven } from "@/lib/sheets/sheets-utils";

/**
 * ============================
 * ENV
 * ============================
 */
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
if (!GOOGLE_SHEET_ID) throw new Error("Missing env: GOOGLE_SHEET_ID");

const ALERTS_TAB = process.env.ALERTS_TAB;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

if (!ALERTS_TAB) throw new Error("Missing env: ALERTS_TAB");
if (!SERVICE_ACCOUNT_BASE64)
  throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

/**
 * ============================
 * Shopping Actions Cache
 * ============================
 */

let shoppingActionsCache: { ts: number; rows: ShoppingActionRow[] } | null =
  null;

const SHOPPING_ACTIONS_CACHE_MS = 5000;

export function clearShoppingActionsCache() {
  shoppingActionsCache = null;
}

/**
 * ============================
 * BUSINESS TIMEZONE
 * ============================
 */
const BUSINESS_TIMEZONE = "America/New_York";

/**
 * ============================
 * Types
 * ============================
 */
export type AlertRow = {
  timestamp: string;
  item: string;
  qty: string;
  location: string;
  note: string;
  ip: string;
  userAgent: string;
  status: "active" | "canceled" | "resolved";
  alertId: string;
  canceledAt: string;
  resolvedAt: string;
  source?: string;
};

export type ShoppingListRow = {
  timestamp?: string;
  upc?: string;
  product_name?: string;
  on_hand_base_units?: any;
  base_unit?: string;
  reorder_point?: any;
  par_level?: any;
  qty_to_order_base_units?: any;
  preferred_vendor?: string;
  default_location?: string;
  note?: string;
};

export type ShoppingActionRow = {
  date?: string; // YYYY-MM-DD (business date)
  upc?: string;
  action?: string; // purchased | dismissed | snoozed | undo
  note?: string;
  actor?: string;
};

export type ReorderEmailLogRow = {
  timestamp?: string;
  business_date?: string;
  items?: any;
  recipients?: any;
  actor?: string;
  request_id?: string;
  items_hash?: string;
};

/**
 * Normalize UPC consistently across the system.
 * Supports real UPC digits AND pseudo-UPCs like "EGG" / "TURKEY_SAUSAGE_PATTY".
 *
 * IMPORTANT:
 * - Use this for *ingredient_upc* (canonical internal key)
 * - Do NOT rely on this for barcode matching (use digits-only logic for barcodes)
 */
function normUpc(v: any): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

/**
 * Barcode detection: 11–14 digits covers UPC-A/EAN/GTIN variants.
 * (Some scanners drop a leading 0, giving 11 digits.)
 */
function isProbablyBarcodeUpc(v: any): boolean {
  const s = String(v ?? "").trim();
  return /^\d{11,14}$/.test(s);
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

// Small retry helper for Google Sheets 429 / transient errors
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxAttempts = 2; // 1 retry
  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;

      const code = e?.code ?? e?.status;
      const msg = String(e?.message || "");
      const is429 = code === 429 || msg.includes("Quota exceeded");
      const is5xx = typeof code === "number" && code >= 500;

      if (attempt < maxAttempts && (is429 || is5xx)) {
        const backoffMs = is429 ? 900 : 400;
        console.log(
          `⚠️ Sheets retry (${label}) attempt ${attempt} -> waiting ${backoffMs}ms`,
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      throw e;
    }
  }

  throw lastErr;
}

/**
 * Exported helper for routes/pages.
 * Business-local date string (YYYY-MM-DD).
 */
export function getBusinessDateNY(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const yyyy = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Normalize header keys so we can match:
 * - "Reorder Point" => "reorder_point"
 * - "reorder-point" => "reorder_point"
 * - "reorder_point" => "reorder_point"
 */
function normalizeHeaderKey(h: any): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_"); // spaces/dashes -> underscore
}

/**
 * Read a tab as header-driven objects, with header normalization.
 */
async function readTabObjectsNormalized(tabName: string): Promise<any[]> {
  const sheets = getSheetsClient();

  const res = (await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${tabName}!A:Z`,
      }),
    `values.get:${tabName}`,
  )) as any;

  const values = res.data?.values || [];
  if (values.length <= 1) return [];

  const headers = (values[0] || []).map((h: any) => normalizeHeaderKey(h));
  const rows = values.slice(1);

  return rows.map((row: any[]) => {
    const obj: any = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i] ?? "";
    return obj;
  });
}

/**
 * Try multiple tab names and return the first that exists (or [] if none exist).
 */
async function readFirstExistingTabObjects(
  tabNames: string[],
): Promise<{ tabName: string | null; rows: any[] }> {
  for (const name of tabNames) {
    try {
      const rows = await readTabObjectsNormalized(name);
      return { tabName: name, rows };
    } catch {
      // try next
    }
  }
  return { tabName: null, rows: [] };
}

function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      return String(v);
  }
  return "";
}

/**
 * Resolve input code to canonical ingredient_upc.
 *
 * Priority:
 * 1) Barcode_Map (barcode_upc -> ingredient_upc) where active != false
 * 2) Catalog fallback (Catalog.barcode_upc -> Catalog.upc)
 * 3) If code matches Catalog.upc, treat as ingredient_upc
 *
 * If not found:
 * - If it looks like a barcode => return null (force mapping)
 * - Else return normUpc(code) (treat as pseudo ingredient key)
 */
export async function resolveIngredientUpcFromCode(
  codeRaw: any,
): Promise<{ ingredient_upc: string | null; source: string }> {
  const raw = String(codeRaw ?? "").trim();
  if (!raw) return { ingredient_upc: null, source: "missing" };

  // For pseudo keys
  const codeNorm = normUpc(raw);

  // For barcodes
  const rawDigits = raw.replace(/\D/g, "");

  // 1) Barcode_Map
  try {
    const rows = await readTabObjectsNormalized("Barcode_Map");
    const hit = rows.find((r: any) => {
      const barcodeDigits = String(r.barcode_upc ?? "")
        .trim()
        .replace(/\D/g, "");

      const active = String(r.active ?? "true")
        .trim()
        .toLowerCase();

      return (
        barcodeDigits &&
        rawDigits &&
        barcodeDigits === rawDigits &&
        active !== "false"
      );
    });

    if (hit) {
      const ingredient = normUpc(hit.ingredient_upc);
      if (ingredient)
        return { ingredient_upc: ingredient, source: "barcode_map" };
    }
  } catch {
    // Barcode_Map may not exist yet; ignore
  }

  // 2) Catalog fallback
  try {
    const catalogRows = await readTabObjectsNormalized(
      process.env.CATALOG_TAB || "Catalog",
    );

    // direct match on Catalog.upc (ingredient key)
    const direct = catalogRows.find((r: any) => normUpc(r.upc) === codeNorm);
    if (direct)
      return { ingredient_upc: normUpc(direct.upc), source: "catalog_upc" };

    // barcode match on Catalog.barcode_upc
    if (rawDigits) {
      const byBarcode = catalogRows.find((r: any) => {
        const b = String(r.barcode_upc ?? "")
          .trim()
          .replace(/\D/g, "");
        return b && b === rawDigits;
      });

      if (byBarcode) {
        const ingredient = normUpc(byBarcode.upc);
        if (ingredient) {
          return {
            ingredient_upc: ingredient,
            source: "catalog_barcode_fallback",
          };
        }
      }
    }
  } catch {
    // ignore
  }

  // 3) Not found
  if (isProbablyBarcodeUpc(raw)) {
    return { ingredient_upc: null, source: "unknown_barcode" };
  }

  // Treat as pseudo ingredient key
  return { ingredient_upc: codeNorm, source: "direct" };
}

/**
 * Detect whether Alerts sheet has a `source` column by reading header row.
 */
async function hasSourceColumn(sheets: any): Promise<boolean> {
  const res = (await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${ALERTS_TAB}!1:1`,
      }),
    "alerts.header.get",
  )) as any;

  const headers = (res.data.values?.[0] || []).map((h: any) =>
    String(h || "")
      .trim()
      .toLowerCase(),
  );

  return headers.includes("source");
}

/**
 * Create an alert (generates alertId + writes to Alerts sheet)
 * Used by: POST /api/alert/create
 */
export async function createAlert(input: {
  item?: string;
  qty?: string;
  location?: string;
  note?: string;
  ip?: string;
  userAgent?: string;
  source?: string;
}): Promise<string> {
  const item = String(input.item ?? "").trim();
  const qty = String(input.qty ?? "").trim();
  const location = String(input.location ?? "").trim();

  if (!item) throw new Error("Missing required field: item");
  if (!qty) throw new Error("Missing required field: qty");
  if (!location) throw new Error("Missing required field: location");

  const alertId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `alert_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  await logAlertToSheet({
    item,
    qty,
    location,
    note: input.note,
    ip: input.ip,
    userAgent: input.userAgent,
    alertId,
    source: input.source,
  });

  return alertId;
}

/**
 * Append an alert row (positional)
 */
export async function logAlertToSheet({
  item,
  qty,
  location,
  note,
  ip,
  userAgent,
  alertId,
  source,
}: {
  item: string;
  qty: string;
  location: string;
  note?: string;
  ip?: string;
  userAgent?: string;
  alertId: string;
  source?: string;
}) {
  const sheets = getSheetsClient();
  const timestamp = new Date().toISOString();
  const includeSource = await hasSourceColumn(sheets);

  const values = [
    [
      timestamp, // A
      item, // B
      qty, // C
      location, // D
      note ?? "", // E
      ip ?? "", // F
      userAgent ?? "", // G
      "active", // H
      alertId, // I
      "", // J
      "", // K
      ...(includeSource ? [(source ?? "").toLowerCase()] : []), // L optional
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${ALERTS_TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/**
 * Uncached Alerts read
 */
async function _getAllAlertsUncached(): Promise<AlertRow[]> {
  const sheets = getSheetsClient();

  const res = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${ALERTS_TAB}!A:L`,
      }),
    "alerts.values.get",
  );

  const values = res.data.values || [];
  if (values.length <= 1) return [];

  const rows = values.slice(1);

  return rows.map((r: any[]) => {
    const [
      timestamp = "",
      item = "",
      qty = "",
      location = "",
      note = "",
      ip = "",
      userAgent = "",
      status = "active",
      alertId = "",
      canceledAt = "",
      resolvedAt = "",
      source = "",
    ] = r;

    const normalizedStatus: "active" | "canceled" | "resolved" =
      status === "canceled"
        ? "canceled"
        : status === "resolved"
          ? "resolved"
          : "active";

    const rowObj: AlertRow = {
      timestamp,
      item,
      qty,
      location,
      note,
      ip,
      userAgent,
      status: normalizedStatus,
      alertId,
      canceledAt,
      resolvedAt,
    };

    if (String(source || "").trim()) rowObj.source = String(source);
    return rowObj;
  });
}

/**
 * Cached getAllAlerts to reduce Sheets read quota usage.
 */
export const getAllAlerts = unstable_cache(
  async () => _getAllAlertsUncached(),
  ["alerts", "all", ALERTS_TAB],
  { revalidate: 10 },
);

export async function getTodayAlerts(): Promise<AlertRow[]> {
  const all = await getAllAlerts();

  const localNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: BUSINESS_TIMEZONE }),
  );

  const start = new Date(localNow);
  start.setHours(0, 0, 0, 0);

  const end = new Date(localNow);
  end.setHours(23, 59, 59, 999);

  return all.filter((r) => {
    if (r.status === "canceled") return false;

    const t = Date.parse(r.timestamp);
    if (Number.isNaN(t)) return false;

    return t >= start.getTime() && t <= end.getTime();
  });
}

export async function getTodayManagerAlerts(): Promise<AlertRow[]> {
  const all = await getTodayAlerts();
  return all.filter((r) => r.status !== "canceled");
}

export async function getTodayChecklist(): Promise<AlertRow[]> {
  const alerts = await getTodayAlerts();

  const latestByKey = new Map<string, AlertRow>();
  for (const alert of alerts) {
    const key = `${alert.item}|${alert.location}`;
    const existing = latestByKey.get(key);

    if (!existing || alert.timestamp > existing.timestamp) {
      latestByKey.set(key, alert);
    }
  }

  return Array.from(latestByKey.values()).filter((a) => a.status === "active");
}

/**
 * ============================
 * Shopping_Actions (state layer)
 * ============================
 */
export async function appendShoppingAction(input: {
  date: string; // YYYY-MM-DD
  upc: string;
  action: "purchased" | "dismissed" | "snoozed" | "undo";
  note?: string;
  actor?: string;
}) {
  const sheets = getSheetsClient();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? "").trim())) {
    throw new Error(
      `Shopping action date must be YYYY-MM-DD. Received: ${input.date}`,
    );
  }

  const headerRes = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `Shopping_Actions!1:1`,
      }),
    "shopping_actions.header.get",
  );

  const rawHeaders = (headerRes.data.values?.[0] || []).map((h: any) =>
    String(h ?? "").trim(),
  );

  const indexByHeader = new Map<string, number>();
  rawHeaders.forEach((h: string, i: number) => {
    const key = h.trim().toLowerCase();
    if (!key) return;
    indexByHeader.set(key, i);
  });

  const required = ["date", "upc", "action", "note", "actor"];
  const missing = required.filter((h) => !indexByHeader.has(h));
  if (missing.length) {
    throw new Error(
      `Shopping_Actions missing headers: ${missing.join(", ")}. Found: ${rawHeaders.join(
        " | ",
      )}`,
    );
  }

  const row: any[] = new Array(rawHeaders.length).fill("");

  row[indexByHeader.get("date")!] = String(input.date).trim();
  row[indexByHeader.get("upc")!] = normUpc(input.upc);
  row[indexByHeader.get("action")!] = String(input.action).toLowerCase();
  row[indexByHeader.get("note")!] = input.note ?? "";
  row[indexByHeader.get("actor")!] = input.actor ?? "";

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `Shopping_Actions!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

async function getShoppingActions(): Promise<ShoppingActionRow[]> {
  const now = Date.now();

  if (
    shoppingActionsCache &&
    now - shoppingActionsCache.ts < SHOPPING_ACTIONS_CACHE_MS
  ) {
    return shoppingActionsCache.rows;
  }

  const sheets = getSheetsClient();

  const res = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `Shopping_Actions!A:Z`,
      }),
    "shopping_actions.values.get",
  );

  const values = res.data.values || [];
  if (values.length <= 1) {
    shoppingActionsCache = { ts: now, rows: [] };
    return [];
  }

  const headers = (values[0] || []).map((h: any) =>
    String(h ?? "")
      .trim()
      .toLowerCase(),
  );

  const rows = values.slice(1);

  const objects: ShoppingActionRow[] = rows.map((row: any[]) => {
    const obj: any = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i] ?? "";
    return obj as ShoppingActionRow;
  });

  const normalized = objects
    .map((r) => ({ ...r, upc: normUpc(r.upc) }))
    .filter((r) => String(r.upc ?? "").length > 0);

  shoppingActionsCache = { ts: now, rows: normalized };

  return normalized;
}

export type InventoryAdjustmentRow = {
  timestamp?: string; // ISO
  date?: string; // YYYY-MM-DD (business date)
  upc?: string;
  adjustment_type?: string; // count | spoilage | waste | etc
  base_units_delta?: any; // can be negative
  reason?: string;
  actor?: string;
};

// ===============================
// Calibration_Log (append-only ledger)
// ===============================

export type CalibrationLogInput = {
  timestamp: string; // ISO
  business_date?: string; // optional; defaults to NY business date
  upc: string;
  calibration_type: string; // e.g. "reorder_point"
  before_value?: string;
  after_value?: string;
  delta?: number | string;
  reason?: string;
  actor?: string;
  source?: string; // e.g. "scan" | "manager" | "system"
  notes?: string;
};

export async function appendCalibrationLog(input: CalibrationLogInput) {
  const tabName = process.env.CALIBRATION_LOG_TAB || "Calibration_Log";
  const business_date = input.business_date || getBusinessDateNY(new Date());

  return appendRowHeaderDriven({
    tabName,
    rowObject: {
      timestamp: input.timestamp,
      business_date,
      upc: normUpc(input.upc),
      calibration_type: input.calibration_type,
      before_value: input.before_value ?? "",
      after_value: input.after_value ?? "",
      delta: input.delta ?? "",
      reason: input.reason ?? "",
      actor: input.actor ?? "",
      source: input.source ?? "system",
      notes: input.notes ?? "",
    },
  });
}

/**
 * Appends a restock/purchase entry to the Purchases sheet.
 * Used when an item is marked as "purchased" from the shopping list.
 */
export async function appendPurchase(input: {
  entered_by?: string;
  upc: string;
  product_name?: string;
  brand?: string;
  size_unit?: string;
  google_category_id?: string;
  google_category_name?: string;
  qty_purchased?: string | number;
  total_price?: string | number;
  unit_price?: string | number;
  store_vendor?: string;
  assigned_location?: string;
  notes?: string;
  base_units_added?: string | number;
}) {
  const sheets = getSheetsClient();
  const PURCHASES_TAB = process.env.PURCHASES_TAB || "Purchases";

  const row = [
    new Date().toISOString(), // timestamp
    String(input.entered_by ?? "").trim(),
    String(input.upc ?? "").trim(),
    String(input.product_name ?? "").trim(),
    String(input.brand ?? "").trim(),
    String(input.size_unit ?? "").trim(),
    String(input.google_category_id ?? "").trim(),
    String(input.google_category_name ?? "").trim(),
    String(input.qty_purchased ?? "").trim(),
    String(input.total_price ?? "").trim(),
    String(input.unit_price ?? "").trim(),
    String(input.store_vendor ?? "").trim(),
    String(input.assigned_location ?? "").trim(),
    String(input.notes ?? "").trim(),
    String(input.base_units_added ?? "").trim(),
  ];

  await withRetry(
    () =>
      sheets.spreadsheets.values.append({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${PURCHASES_TAB}!A:O`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [row],
        },
      }),
    "purchases.values.append",
  );
}

/**
 * ============================
 * Inventory_Adjustments (ledger)
 * ============================
 */
export async function appendInventoryAdjustment(input: {
  date?: string; // YYYY-MM-DD
  upc: string;
  base_units_delta: number; // can be negative
  adjustment_type?: string;
  reason?: string;
  actor?: string;
}) {
  const sheets = getSheetsClient();

  const date = String(input.date ?? getBusinessDateNY()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      `Inventory adjustment date must be YYYY-MM-DD. Received: ${date}`,
    );
  }

  const headerRes = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `Inventory_Adjustments!1:1`,
      }),
    "inventory_adjustments.header.get",
  );

  const rawHeaders = (headerRes.data.values?.[0] || []).map((h: any) =>
    String(h ?? "").trim(),
  );

  const indexByHeader = new Map<string, number>();
  rawHeaders.forEach((h: string, i: number) => {
    const key = h.trim().toLowerCase();
    if (!key) return;
    indexByHeader.set(key, i);
  });

  const required = [
    "timestamp",
    "date",
    "upc",
    "adjustment_type",
    "base_units_delta",
    "reason",
    "actor",
  ];

  const missing = required.filter((h) => !indexByHeader.has(h));
  if (missing.length) {
    throw new Error(
      `Inventory_Adjustments missing headers: ${missing.join(", ")}. Found: ${rawHeaders.join(
        " | ",
      )}`,
    );
  }

  const row: any[] = new Array(rawHeaders.length).fill("");

  row[indexByHeader.get("timestamp")!] = new Date().toISOString();
  row[indexByHeader.get("date")!] = date;
  row[indexByHeader.get("upc")!] = normUpc(input.upc);

  row[indexByHeader.get("adjustment_type")!] = String(
    input.adjustment_type ?? "adjust",
  )
    .trim()
    .toLowerCase();

  row[indexByHeader.get("base_units_delta")!] = String(input.base_units_delta);
  row[indexByHeader.get("reason")!] = input.reason ?? "";
  row[indexByHeader.get("actor")!] = input.actor ?? "";

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `Inventory_Adjustments!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

export async function getInventoryAdjustments(opts?: {
  date?: string; // YYYY-MM-DD
}): Promise<InventoryAdjustmentRow[]> {
  const dateFilter = String(opts?.date ?? "").trim();

  const rows = await readTabObjectsNormalized("Inventory_Adjustments").catch(
    () => [],
  );

  const normalized = rows
    .map((r: any) => ({
      ...r,
      upc: normUpc(r.upc),
    }))
    .filter((r: any) => String(r.upc ?? "").length > 0);

  if (!dateFilter) return normalized;

  return normalized.filter(
    (r: any) => String(r.date ?? "").trim() === dateFilter,
  );
}

export async function getAdjustmentDeltaByUpc(opts?: {
  date?: string; // YYYY-MM-DD (business date)
}): Promise<Map<string, number>> {
  const adj = await getInventoryAdjustments({ date: opts?.date });
  const map = new Map<string, number>();

  for (const r of adj) {
    const upc = normUpc(r.upc);
    if (!upc) continue;

    const n =
      Number(
        String((r as any).base_units_delta ?? "0").replace(/[^0-9.-]/g, ""),
      ) || 0;

    map.set(upc, (map.get(upc) || 0) + n);
  }

  return map;
}

/**
 * ============================
 * Shopping_List (computed) + Shopping_Manual merge + hide rules
 * OPTION B: Catalog enrichment
 * ============================
 */
export async function getShoppingList(opts?: {
  includeHidden?: boolean;
}): Promise<ShoppingListRow[]> {
  const includeHidden = !!opts?.includeHidden;

  const SHOPPING_LIST_TAB = process.env.SHOPPING_LIST_TAB || "Shopping_List";
  const SHOPPING_MANUAL_TAB =
    process.env.SHOPPING_MANUAL_TAB || "Shopping_Manual";

  const [computedRaw, manualRaw] = await Promise.all([
    readTabObjectsNormalized(SHOPPING_LIST_TAB),
    readTabObjectsNormalized(SHOPPING_MANUAL_TAB).catch((e) => {
      console.warn(
        "⚠️ Failed reading manual tab:",
        SHOPPING_MANUAL_TAB,
        e?.message || e,
      );
      return [];
    }),
  ]);

  const catalogRaw = await readTabObjectsNormalized("Catalog");

  const catalogByUpc = new Map<string, any>();
  for (const r of catalogRaw) {
    const upcVal = pick(r, ["upc", "sku", "plu", "item_code", "code", "id"]);
    const upc = normUpc(upcVal);
    if (!upc) continue;
    if (!catalogByUpc.has(upc)) catalogByUpc.set(upc, r);
  }

  function enrichFromCatalog(row: ShoppingListRow): ShoppingListRow {
    const upc = normUpc(row.upc);
    const cat = catalogByUpc.get(upc);
    if (!cat) return row;

    return {
      ...row,
      product_name:
        String(row.product_name ?? "").trim() !== ""
          ? row.product_name
          : pick(cat, ["product_name", "name", "item_name", "product"]),
      base_unit:
        String(row.base_unit ?? "").trim() !== ""
          ? row.base_unit
          : pick(cat, ["base_unit", "unit", "uom", "size_unit"]),
      reorder_point:
        String(row.reorder_point ?? "").trim() !== ""
          ? row.reorder_point
          : pick(cat, ["reorder_point", "reorder_level", "reorder"]),
      par_level:
        String(row.par_level ?? "").trim() !== ""
          ? row.par_level
          : pick(cat, ["par_level", "par", "parlevel"]),
      preferred_vendor:
        String(row.preferred_vendor ?? "").trim() !== ""
          ? row.preferred_vendor
          : pick(cat, ["preferred_vendor", "vendor", "supplier"]),
      default_location:
        String(row.default_location ?? "").trim() !== ""
          ? row.default_location
          : pick(cat, ["default_location", "location", "default_loc", "loc"]),
    };
  }

  const computed: ShoppingListRow[] = computedRaw
    .map((r: any) => {
      const possibleUpc = r.upc || r.UPC || r.sku || r.SKU || r.code || r.id;
      return { ...r, upc: normUpc(possibleUpc) };
    })
    .filter((r) => String(r.upc ?? "").trim().length > 0)
    .map(enrichFromCatalog);

  const manual: ShoppingListRow[] = manualRaw
    .map((r: any) => {
      const possibleUpc = r.upc || r.UPC || r.sku || r.SKU || r.code || r.id;
      return { ...r, upc: normUpc(possibleUpc) };
    })
    .filter((r) => String(r.upc ?? "").trim().length > 0)
    .map(enrichFromCatalog);

  const byUpc = new Map<string, ShoppingListRow>();
  for (const r of manual) byUpc.set(normUpc(r.upc), r);
  for (const r of computed) byUpc.set(normUpc(r.upc), r);

  let filtered = Array.from(byUpc.values());

  if (!includeHidden) {
    const now = new Date();
    const today = getBusinessDateNY(now);
    const yesterday = getBusinessDateNY(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );

    const actions = await getShoppingActions();

    const latestActionByUpc = new Map<
      string,
      { action: string; date: string; note: string }
    >();

    for (const a of actions) {
      const d = String(a.date ?? "").trim();
      const upc = normUpc(a.upc);
      if (!upc) continue;

      const act = String(a.action ?? "")
        .trim()
        .toLowerCase();
      if (!act) continue;

      const note = String(a.note ?? "")
        .trim()
        .toLowerCase();

      // Only keep a short recent window for action-based suppression
      if (d !== yesterday && d !== today) continue;

      latestActionByUpc.set(upc, { action: act, date: d, note });
    }

    const hiddenUpcs = new Set(
      Array.from(latestActionByUpc.entries())
        .filter(([, value]) => {
          const act = value.action;
          const d = value.date;
          const note = value.note;

          if (act === "dismissed") {
            return d === today;
          }

          if (act === "purchased") {
            return d === today || d === yesterday;
          }

          if (act === "snoozed") {
            if (note === "snooze:later_today") {
              return d === today;
            }

            if (note === "snooze:tomorrow") {
              return d === today || d === yesterday;
            }

            if (note === "snooze:two_days") {
              return d === today || d === yesterday;
            }

            // fallback for older snooze rows without structured note
            return d === today;
          }

          return false;
        })
        .map(([upc]) => upc),
    );

    filtered = filtered.filter((r) => !hiddenUpcs.has(normUpc(r.upc)));
  }

  filtered.sort((a, b) => {
    const qa =
      Number(
        String(a.qty_to_order_base_units ?? "0").replace(/[^0-9.-]/g, ""),
      ) || 0;
    const qb =
      Number(
        String(b.qty_to_order_base_units ?? "0").replace(/[^0-9.-]/g, ""),
      ) || 0;
    return qb - qa;
  });

  return filtered;
}

/**
 * ============================
 * Reorder_Email_Log (spam resistance)
 * ============================
 */
export async function shouldSendReorderEmail(opts: {
  businessDate: string;
  cooldownMinutes: number;
  forceLevel: 0 | 1 | 2;
}): Promise<{
  okToSend: boolean;
  reason: "ok" | "cooldown" | "already_sent_today";
  lastSentAtISO: string | null;
  lastBusinessDate: string | null;
  debug?: any;
}> {
  const sheets = getSheetsClient();

  const res = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `Reorder_Email_Log!A:Z`,
      }),
    "reorder_email_log.values.get",
  );

  const values = res.data.values || [];
  if (values.length <= 1) {
    return {
      okToSend: true,
      reason: "ok",
      lastSentAtISO: null,
      lastBusinessDate: null,
      debug: { rows: 0 },
    };
  }

  const headers = (values[0] || []).map((h: any) =>
    String(h ?? "")
      .trim()
      .toLowerCase(),
  );

  const idx = (name: string) => headers.indexOf(name);

  const tsIdx = idx("timestamp");
  const bdIdx = idx("business_date");

  if (tsIdx === -1 || bdIdx === -1) {
    return {
      okToSend: true,
      reason: "ok",
      lastSentAtISO: null,
      lastBusinessDate: null,
      debug: {
        rows: values.length - 1,
        missingHeaders: {
          timestamp: tsIdx === -1,
          business_date: bdIdx === -1,
        },
        headersFound: headers,
      },
    };
  }

  const rows = values.slice(1);
  const now = new Date();
  const cutoffMs = Math.max(1, opts.cooldownMinutes) * 60 * 1000;

  let lastSentAt: Date | null = null;
  let lastBusinessDate: string | null = null;
  let sentToday = false;

  for (const r of rows) {
    const bd = String(r[bdIdx] ?? "").trim();
    if (bd === opts.businessDate) sentToday = true;

    const ts = String(r[tsIdx] ?? "").trim();
    const t = Date.parse(ts);
    if (Number.isNaN(t)) continue;

    const d = new Date(t);
    if (!lastSentAt || d.getTime() > lastSentAt.getTime()) {
      lastSentAt = d;
      lastBusinessDate = bd || null;
    }
  }

  if (lastSentAt && opts.forceLevel < 2) {
    const age = now.getTime() - lastSentAt.getTime();
    if (age >= 0 && age < cutoffMs) {
      return {
        okToSend: false,
        reason: "cooldown",
        lastSentAtISO: lastSentAt.toISOString(),
        lastBusinessDate,
        debug: { rows: rows.length },
      };
    }
  }

  if (sentToday && opts.forceLevel === 0) {
    return {
      okToSend: false,
      reason: "already_sent_today",
      lastSentAtISO: lastSentAt?.toISOString() ?? null,
      lastBusinessDate,
      debug: { rows: rows.length },
    };
  }

  return {
    okToSend: true,
    reason: "ok",
    lastSentAtISO: lastSentAt?.toISOString() ?? null,
    lastBusinessDate,
    debug: { rows: rows.length },
  };
}

export async function appendReorderEmailLogRow(input: {
  timestamp: string;
  business_date: string;
  items: number;
  recipients: number;
  actor: string;
  request_id: string;
  items_hash: string;
}) {
  const sheets = getSheetsClient();

  const headerRes = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `Reorder_Email_Log!1:1`,
      }),
    "reorder_email_log.header.get",
  );

  const rawHeaders = (headerRes.data.values?.[0] || []).map((h: any) =>
    String(h ?? "").trim(),
  );

  const indexByHeader = new Map<string, number>();
  rawHeaders.forEach((h: string, i: number) => {
    const key = h.trim().toLowerCase();
    if (!key) return;
    indexByHeader.set(key, i);
  });

  const required = [
    "timestamp",
    "business_date",
    "items",
    "recipients",
    "actor",
    "request_id",
    "items_hash",
  ];

  const missing = required.filter((h) => !indexByHeader.has(h));
  if (missing.length) {
    throw new Error(
      `Reorder_Email_Log missing headers: ${missing.join(
        ", ",
      )}. Found: ${rawHeaders.join(" | ")}`,
    );
  }

  const row: any[] = new Array(rawHeaders.length).fill("");

  row[indexByHeader.get("timestamp")!] = input.timestamp;
  row[indexByHeader.get("business_date")!] = input.business_date;
  row[indexByHeader.get("items")!] = String(input.items);
  row[indexByHeader.get("recipients")!] = String(input.recipients);
  row[indexByHeader.get("actor")!] = input.actor;
  row[indexByHeader.get("request_id")!] = input.request_id;
  row[indexByHeader.get("items_hash")!] = input.items_hash;

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `Reorder_Email_Log!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}

/**
 * ============================
 * Cancel/Resolve by alertId (positional)
 * ============================
 */
async function updateAlertStatusById(
  alertId: string,
  nextStatus: "canceled" | "resolved",
): Promise<boolean> {
  const sheets = getSheetsClient();

  const res = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${ALERTS_TAB}!A:L`,
      }),
    "alerts.values.get.for_update",
  );

  const values = res.data.values || [];
  if (values.length <= 1) return false;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowAlertId = row[8]; // I

    if (rowAlertId === alertId) {
      const rowNumber = i + 1;
      const now = new Date().toISOString();

      const canceledAtVal = nextStatus === "canceled" ? now : "";
      const resolvedAtVal = nextStatus === "resolved" ? now : "";

      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${ALERTS_TAB}!H${rowNumber}:K${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[nextStatus, alertId, canceledAtVal, resolvedAtVal]],
        },
      });

      return true;
    }
  }

  return false;
}

export async function cancelAlertById(alertId: string): Promise<boolean> {
  return updateAlertStatusById(alertId, "canceled");
}

export async function resolveAlertById(alertId: string): Promise<boolean> {
  return updateAlertStatusById(alertId, "resolved");
}

/**
 * ===============================
 * Ensure Catalog Item Exists (SAFE + STRICT)
 * ===============================
 *
 * ✅ MUST NOT create Catalog rows keyed by a raw barcode.
 * ✅ MUST NOT invent a UPC from product_name.
 *
 * Rules:
 * - If you pass a barcode, it MUST already be mapped -> ingredient_upc.
 * - If you pass an ingredient_upc, it uses that.
 * - If you pass nothing, it throws (prevents silent corruption).
 */
export async function ensureCatalogItem(input: {
  upc?: string; // may be ingredient_upc OR scanned barcode
  product_name: string;
}) {
  const CATALOG_TAB = process.env.CATALOG_TAB || "Catalog";

  const raw = String(input.upc || "").trim();
  const product_name = String(input.product_name || "").trim();

  if (!product_name) throw new Error("Missing product_name");
  if (!raw) {
    throw new Error(
      "Missing upc. Pass ingredient_upc (or a barcode_upc that is already mapped).",
    );
  }

  // Resolve raw code to canonical ingredient_upc
  const resolved = await resolveIngredientUpcFromCode(raw);
  if (!resolved.ingredient_upc) {
    throw new Error(
      "Unknown barcode. Add mapping in Barcode_Map (or Catalog barcode fallback) before ensuring Catalog item.",
    );
  }

  const ingredientUpc = resolved.ingredient_upc;

  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${CATALOG_TAB}!A:Z`,
  });

  const values = res.data.values || [];
  if (values.length === 0) throw new Error("Catalog sheet missing headers");

  const header = values[0].map((h) => String(h).trim());
  const idx = (col: string) => header.indexOf(col);

  const i_upc = idx("upc");
  const i_name = idx("product_name");
  const i_last = idx("last_seen");

  if (i_upc === -1) throw new Error("Catalog missing 'upc' header");
  if (i_name === -1) throw new Error("Catalog missing 'product_name' header");

  let found = false;
  let rowIndex = -1;

  // 1) Match by ingredient_upc (canonical)
  for (let r = 1; r < values.length; r++) {
    if (normUpc(values[r][i_upc]) === normUpc(ingredientUpc)) {
      found = true;
      rowIndex = r;
      break;
    }
  }

  // 2) Fallback match by product_name (legacy)
  if (!found) {
    const normName = product_name.toLowerCase().trim();
    for (let r = 1; r < values.length; r++) {
      const existing = String(values[r][i_name] || "")
        .toLowerCase()
        .trim();
      if (existing === normName) {
        found = true;
        rowIndex = r;
        break;
      }
    }
  }

  // Update last_seen if found
  if (found) {
    if (i_last !== -1) {
      const sheetRow = rowIndex + 1;
      values[rowIndex][i_last] = new Date().toISOString();

      await sheets.spreadsheets.values.update({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${CATALOG_TAB}!A${sheetRow}:Z${sheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [values[rowIndex]] },
      });
    }

    return { created: false, upc: ingredientUpc };
  }

  // Create new row keyed by ingredient_upc only
  const newRow = new Array(header.length).fill("");

  const set = (col: string, val: any) => {
    const i = idx(col);
    if (i !== -1) newRow[i] = val;
  };

  set("upc", ingredientUpc);
  set("product_name", product_name);
  set("active", "true");
  set("last_seen", new Date().toISOString());

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${CATALOG_TAB}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newRow] },
  });

  return { created: true, upc: ingredientUpc };
}
