// lib/sheets-core.ts
import { google } from "googleapis";
import { unstable_cache } from "next/cache";
import type { sheets_v4 } from "googleapis";

/**
 * ============================
 * ENV
 * ============================
 */
// const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID; // your project uses SHEET_ID
// ✅ CHANGE: Support both env names so all routes read the same spreadsheet
const GOOGLE_SHEET_ID = process.env.SHEET_ID || process.env.GOOGLE_SHEET_ID;
if (!GOOGLE_SHEET_ID)
  throw new Error("Missing env: SHEET_ID (or GOOGLE_SHEET_ID)");

const ALERTS_TAB = process.env.ALERTS_TAB || process.env.SHEET_TAB; // backward compatible
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

if (!GOOGLE_SHEET_ID) throw new Error("Missing env: SHEET_ID");
if (!ALERTS_TAB)
  throw new Error("Missing env: ALERTS_TAB (or legacy SHEET_TAB)");
if (!SERVICE_ACCOUNT_BASE64)
  throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

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
 */
function normUpc(v: any): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
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
export function getBusinessDateNY(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

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
 * Read a tab as header-driven objects, with header normalization:
 * - keys are normalized via normalizeHeaderKey
 *
 * ✅ FIX: This MUST read the tabName you pass in.
 * Before, it incorrectly read ALERTS_TAB for every tab.
 */
async function readTabObjectsNormalized(tabName: string): Promise<any[]> {
  const sheets = getSheetsClient();

  // const res = await withRetry(
  //   () =>
  //     sheets.spreadsheets.values.get({
  //       spreadsheetId: GOOGLE_SHEET_ID!,
  //       range: `${tabName}!A:Z`,
  //     }),
  //   `values.get:${tabName}`,
  // );

  // const values = res.data.values || [];

  const res = (await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID!,
        range: `${tabName}!A:Z`,
      }),
    `values.get:${tabName}`,
  )) as sheets_v4.Schema$ValueRange;

  const values = res.values || [];

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
 * (Used for Option B Catalog enrichment)
 */
async function readFirstExistingTabObjects(
  tabNames: string[],
): Promise<{ tabName: string | null; rows: any[] }> {
  for (const name of tabNames) {
    try {
      const rows = await readTabObjectsNormalized(name);
      // If the sheet exists but is empty, that's still valid.
      return { tabName: name, rows };
    } catch {
      // Tab doesn't exist or not accessible -> try next
    }
  }
  return { tabName: null, rows: [] };
}

/**
 * Safely read a value from an object using multiple possible keys.
 * Returns "" if nothing found (or only whitespace).
 */
function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      return String(v);
  }
  return "";
}

/**
 * Detect whether Alerts sheet has a `source` column by reading header row.
 */
// async function hasSourceColumn(sheets: any): Promise<boolean> {
//   const res = await withRetry(
//     () =>
//       sheets.spreadsheets.values.get({
//         spreadsheetId: GOOGLE_SHEET_ID!,
//         range: `${ALERTS_TAB}!1:1`,
//       }),
//     "alerts.header.get",
//   );

//   const headers = (res.data.values?.[0] || []).map((h: any) =>
//     String(h || "")
//       .trim()
//       .toLowerCase(),
//   );

//   return headers.includes("source");
// }

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

  // Prefer crypto.randomUUID() (Node 18+). Fallback for older runtimes.
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
 * Start with 10s. If you still see 429s, bump to 30s.
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
 * Expected sheet headers (case-insensitive):
 * date | upc | action | note | actor
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

/**
 * Read Shopping_Actions (header-driven objects)
 */
async function getShoppingActions(): Promise<ShoppingActionRow[]> {
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
  if (values.length <= 1) return [];

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

  return objects
    .map((r) => ({ ...r, upc: normUpc(r.upc) }))
    .filter((r) => String(r.upc ?? "").length > 0);
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

/**
 * Read Inventory_Adjustments as objects (normalized headers + normalized UPC).
 */
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

/**
 * Convenience: sum adjustments by UPC (for a given date or all-time).
 */
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

  console.log("SHOPPING_LIST_TAB:", SHOPPING_LIST_TAB);
  console.log("SHOPPING_MANUAL_TAB:", SHOPPING_MANUAL_TAB);
  console.log("computedRaw length:", computedRaw.length);
  console.log("manualRaw length:", manualRaw.length);

  const catalogCandidates = [
    "Catalog",
    "CATALOG",
    "Product_Catalog",
    "Products",
    "Inventory_Catalog",
    "Items",
  ];

  const catalogRes = await readFirstExistingTabObjects(catalogCandidates);

  const catalogByUpc = new Map<string, any>();
  for (const r of catalogRes.rows) {
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
          : pick(cat, [
              "reorder_point",
              "reorderpoint",
              "reorder_level",
              "reorder",
            ]),
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
    .map((r: any) => ({ ...r, upc: normUpc(r.upc) }))
    .filter((r) => String(r.upc ?? "").length > 0)
    .map(enrichFromCatalog);

  const manual: ShoppingListRow[] = manualRaw
    .map((r: any) => ({ ...r, upc: normUpc(r.upc) }))
    .filter((r) => String(r.upc ?? "").length > 0)
    .map(enrichFromCatalog);

  const byUpc = new Map<string, ShoppingListRow>();
  for (const r of manual) byUpc.set(normUpc(r.upc), r);
  for (const r of computed) byUpc.set(normUpc(r.upc), r);

  let filtered = Array.from(byUpc.values());

  if (!includeHidden) {
    const today = getBusinessDateNY();
    const actions = await getShoppingActions();

    const latestActionByUpc = new Map<string, string>();
    for (const a of actions) {
      const d = String(a.date ?? "").trim();
      if (d !== today) continue;

      const upc = normUpc(a.upc);
      if (!upc) continue;

      const act = String(a.action ?? "")
        .trim()
        .toLowerCase();
      if (!act) continue;

      latestActionByUpc.set(upc, act);
    }

    const hiddenUpcs = new Set(
      Array.from(latestActionByUpc.entries())
        .filter(
          ([, act]) =>
            act === "purchased" || act === "dismissed" || act === "snoozed",
        )
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

/**
 * Header-driven append to Reorder_Email_Log
 */
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
      `Reorder_Email_Log missing headers: ${missing.join(", ")}. Found: ${rawHeaders.join(
        " | ",
      )}`,
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

// ===============================
// Ensure Catalog Item Exists
// ===============================
export async function ensureCatalogItem(input: {
  upc?: string;
  product_name: string;
}) {
  const CATALOG_TAB = process.env.CATALOG_TAB || "Catalog";

  const upc = String(input.upc || "").trim();
  const product_name = String(input.product_name || "").trim();

  if (!product_name) {
    throw new Error("Missing product_name");
  }

  const sheets = await getSheetsClient(); // use your existing client getter
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${CATALOG_TAB}!A:Z`,
  });

  const values = res.data.values || [];
  if (values.length === 0) {
    throw new Error("Catalog sheet missing headers");
  }

  const header = values[0].map((h) => String(h).trim());
  const idx = (col: string) => header.indexOf(col);

  const i_upc = idx("upc");
  const i_name = idx("product_name");
  const i_last = idx("last_seen");

  if (i_name === -1) {
    throw new Error("Catalog missing 'product_name' header");
  }

  let found = false;
  let rowIndex = -1;

  // Try match by UPC first
  if (upc && i_upc !== -1) {
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][i_upc] || "").trim() === upc) {
        found = true;
        rowIndex = r;
        break;
      }
    }
  }

  // Fallback: match by name
  if (!found) {
    const norm = product_name.toLowerCase().trim();
    for (let r = 1; r < values.length; r++) {
      const existing = String(values[r][i_name] || "")
        .toLowerCase()
        .trim();
      if (existing === norm) {
        found = true;
        rowIndex = r;
        break;
      }
    }
  }

  // If found → update last_seen
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

    return { created: false };
  }

  // If not found → append new row
  const newRow = new Array(header.length).fill("");

  const set = (col: string, val: any) => {
    const i = idx(col);
    if (i !== -1) newRow[i] = val;
  };

  set("upc", upc);
  set("product_name", product_name);
  set("active", "true");
  set("last_seen", new Date().toISOString());

  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${CATALOG_TAB}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newRow] },
  });

  return { created: true };
}
