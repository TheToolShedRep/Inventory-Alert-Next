// lib/sheets-core.ts
import { google } from "googleapis";

/**
 * ============================
 * ENV
 * ============================
 */
const GOOGLE_SHEET_ID = process.env.SHEET_ID; // your project uses SHEET_ID
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
 * Generic helper: read a tab as header-driven objects.
 * - Header keys are normalized to lowercase
 * - Missing tab -> caller can catch() and treat as empty
 */
async function readTabObjects(tabName: string): Promise<any[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${tabName}!A:Z`,
  });

  const values = res.data.values || [];
  if (values.length <= 1) return [];

  const headers = (values[0] || []).map((h: any) =>
    String(h ?? "")
      .trim()
      .toLowerCase(),
  );

  const rows = values.slice(1);

  return rows.map((row: any[]) => {
    const obj: any = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i] ?? "";
    return obj;
  });
}

/**
 * Detect whether Alerts sheet has a `source` column by reading header row.
 */
async function hasSourceColumn(sheets: any): Promise<boolean> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${ALERTS_TAB}!1:1`,
  });

  const headers = (res.data.values?.[0] || []).map((h: any) =>
    String(h || "")
      .trim()
      .toLowerCase(),
  );

  return headers.includes("source");
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
 * Read all alerts (A:K + optional L)
 */
export async function getAllAlerts(): Promise<AlertRow[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${ALERTS_TAB}!A:L`,
  });

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
 *
 * IMPORTANT:
 * - Append-only ledger (no DB).
 * - Header-driven append to prevent column shift issues.
 */
export async function appendShoppingAction(input: {
  date: string; // YYYY-MM-DD
  upc: string;
  action: "purchased" | "dismissed" | "snoozed" | "undo";
  note?: string;
  actor?: string;
}) {
  const sheets = getSheetsClient();

  // Safety: validate date format to protect “today” logic
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date ?? "").trim())) {
    throw new Error(
      `Shopping action date must be YYYY-MM-DD. Received: ${input.date}`,
    );
  }

  // Read header row
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `Shopping_Actions!1:1`,
  });

  const rawHeaders = (headerRes.data.values?.[0] || []).map((h: any) =>
    String(h ?? "").trim(),
  );

  // Case-insensitive header index
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

  // Align row to current header layout
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

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `Shopping_Actions!A:Z`,
  });

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

  // Normalize UPC so matching is reliable
  return objects
    .map((r) => ({ ...r, upc: normUpc(r.upc) }))
    .filter((r) => String(r.upc ?? "").length > 0);
}

/**
 * ============================
 * Shopping_List (computed) + Shopping_Manual merge + hide rules
 * ============================
 *
 * Tabs:
 * - Shopping_List (computed output from reorder-check)
 * - Shopping_Manual (manual test lane)
 *
 * Merge policy:
 * - Dedupe by UPC
 * - Computed wins (manual is additive, not overriding real reorder results)
 */
export async function getShoppingList(opts?: {
  includeHidden?: boolean;
}): Promise<ShoppingListRow[]> {
  const includeHidden = !!opts?.includeHidden;

  // Read computed + manual in parallel.
  // If Shopping_Manual doesn't exist yet, treat as empty.
  const [computedRaw, manualRaw] = await Promise.all([
    readTabObjects("Shopping_List"),
    readTabObjects("Shopping_Manual").catch(() => []),
  ]);

  const computed: ShoppingListRow[] = computedRaw
    .map((r: any) => ({ ...r, upc: normUpc(r.upc) }))
    .filter((r) => String(r.upc ?? "").length > 0);

  const manual: ShoppingListRow[] = manualRaw
    .map((r: any) => ({ ...r, upc: normUpc(r.upc) }))
    .filter((r) => String(r.upc ?? "").length > 0);

  // Merge + dedupe by UPC (manual first, computed overwrites -> computed wins)
  const byUpc = new Map<string, ShoppingListRow>();
  for (const r of manual) byUpc.set(normUpc(r.upc), r);
  for (const r of computed) byUpc.set(normUpc(r.upc), r);

  let filtered = Array.from(byUpc.values());

  // Hide rules: latest action wins per UPC for TODAY (unchanged)
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

  // Sort by qty_to_order desc (unchanged)
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
 * Tab: Reorder_Email_Log
 * Expected headers:
 * timestamp | business_date | items | recipients | actor | request_id | items_hash
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

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `Reorder_Email_Log!A:Z`,
  });

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

  // Fail-open if sheet header is wrong (but include debug)
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

  // Cooldown blocks repeated sends unless force=2
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

  // Daily lock blocks unless force>=1
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
 * Expected headers:
 * timestamp | business_date | items | recipients | actor | request_id | items_hash
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

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `Reorder_Email_Log!1:1`,
  });

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

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID!,
    range: `${ALERTS_TAB}!A:L`,
  });

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
