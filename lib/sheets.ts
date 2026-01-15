// lib/sheets.ts
import { google } from "googleapis";

/**
 * ============================
 * ENV
 * ============================
 *
 * Google Sheets uses ONE spreadsheetId (SHEET_ID) for the entire file.
 * Individual tabs are addressed by name via the range: `${TAB_NAME}!A:K`
 *
 * This file handles ALERTS data only.
 *
 * ✅ Recommended env going forward:
 *   - SHEET_ID
 *   - GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
 *   - ALERTS_TAB=Alerts
 *
 * 🟡 Backwards-compatible fallback:
 *   - SHEET_TAB (older name used previously)
 */
const SHEET_ID = process.env.SHEET_ID;
const ALERTS_TAB = process.env.ALERTS_TAB || process.env.SHEET_TAB; // backward compatible
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

if (!SHEET_ID) throw new Error("Missing env: SHEET_ID");
if (!ALERTS_TAB)
  throw new Error("Missing env: ALERTS_TAB (or legacy SHEET_TAB)");
if (!SERVICE_ACCOUNT_BASE64)
  throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

/**
 * ============================
 * BUSINESS TIMEZONE
 * ============================
 * Inventory operations are based on local store days, not UTC calendar days.
 * This prevents alerts submitted late at night from disappearing due to UTC rollover.
 */
const BUSINESS_TIMEZONE = "America/New_York";

/**
 * ============================
 * Row type (camelCase in code; snake_case headers in Sheets is fine)
 * ============================
 *
 * Alerts sheet columns (A:K):
 * A timestamp
 * B item
 * C qty            (we use: "low" | "empty")
 * D location
 * E note
 * F ip
 * G user_agent
 * H status         ("active" | "canceled" | "resolved")
 * I alert_id
 * J canceled_at
 * K resolved_at
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
};

/**
 * ============================
 * Sheets client
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
 * ============================
 * Append an alert row to Alerts tab
 * Matches columns A:K.
 * ============================
 */
export async function logAlertToSheet({
  item,
  qty,
  location,
  note,
  ip,
  userAgent,
  alertId,
}: {
  item: string;
  qty: string; // "low" | "empty"
  location: string;
  note?: string;
  ip?: string;
  userAgent?: string;
  alertId: string;
}) {
  const sheets = getSheetsClient();
  const timestamp = new Date().toISOString();

  // Alerts tab columns A:K
  const values = [
    [
      timestamp, // A timestamp
      item, // B item
      qty, // C qty
      location, // D location
      note ?? "", // E note
      ip ?? "", // F ip
      userAgent ?? "", // G user_agent
      "active", // H status
      alertId, // I alert_id
      "", // J canceled_at
      "", // K resolved_at
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID!,
    range: `${ALERTS_TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/**
 * ============================
 * Read all alerts from Alerts tab (A:K)
 * ============================
 */
export async function getAllAlerts(): Promise<AlertRow[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
    range: `${ALERTS_TAB}!A:K`,
  });

  const values = res.data.values || [];
  if (values.length <= 1) return [];

  const rows = values.slice(1);

  return rows.map((r) => {
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
    ] = r;

    const normalizedStatus: "active" | "canceled" | "resolved" =
      status === "canceled"
        ? "canceled"
        : status === "resolved"
        ? "resolved"
        : "active";

    return {
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
  });
}

/**
 * ============================
 * Get today's alerts (business-local day)
 * NOTE:
 * - We exclude canceled so they don't clutter daily views.
 * - Resolved stays (Manager + CSV need an audit trail).
 * ============================
 */
export async function getTodayAlerts(): Promise<AlertRow[]> {
  const all = await getAllAlerts();

  const localNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: BUSINESS_TIMEZONE })
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

/**
 * ============================
 * Manager view for today:
 * - includes active + resolved
 * - excludes canceled
 * ============================
 */
export async function getTodayManagerAlerts(): Promise<AlertRow[]> {
  const all = await getTodayAlerts();
  return all.filter((r) => r.status !== "canceled");
}

/**
 * ============================
 * Checklist for today:
 * - deduped by item+location (latest wins, regardless of status)
 * - then only returns rows where the latest status is ACTIVE
 *
 * This prevents an item from "coming back" after refresh when an older active alert
 * exists behind a newer resolved alert.
 * ============================
 */
export async function getTodayChecklist(): Promise<AlertRow[]> {
  const alerts = await getTodayAlerts(); // already excludes canceled

  // Step 1: find the latest alert per item+location (any status)
  const latestByKey = new Map<string, AlertRow>();

  for (const alert of alerts) {
    const key = `${alert.item}|${alert.location}`;
    const existing = latestByKey.get(key);

    if (!existing || alert.timestamp > existing.timestamp) {
      latestByKey.set(key, alert);
    }
  }

  // Step 2: show ONLY if the latest alert is active
  return Array.from(latestByKey.values()).filter((a) => a.status === "active");
}

/**
 * ============================
 * Cancel an alert by alertId (soft cancel)
 * Meaning: "this alert was a mistake / undo"
 *
 * - Finds matching row by I column (alert_id)
 * - Updates H:K (status, alert_id, canceled_at, resolved_at)
 * ============================
 */
export async function cancelAlertById(alertId: string): Promise<boolean> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
    range: `${ALERTS_TAB}!A:K`,
  });

  const values = res.data.values || [];
  if (values.length <= 1) return false;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowAlertId = row[8]; // I column (0-indexed)

    if (rowAlertId === alertId) {
      const rowNumber = i + 1; // sheet rows are 1-indexed
      const canceledAt = new Date().toISOString();

      // Update H:K
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID!,
        range: `${ALERTS_TAB}!H${rowNumber}:K${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["canceled", alertId, canceledAt, ""]],
        },
      });

      return true;
    }
  }

  return false;
}

/**
 * ============================
 * Resolve an alert by alertId (soft resolve)
 * Meaning: "we restocked / replaced / bought it"
 *
 * - Finds matching row by I column (alert_id)
 * - Updates H:K (status, alert_id, canceled_at, resolved_at)
 * ============================
 */
export async function resolveAlertById(alertId: string): Promise<boolean> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
    range: `${ALERTS_TAB}!A:K`,
  });

  const values = res.data.values || [];
  if (values.length <= 1) return false;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowAlertId = row[8]; // I column (0-indexed)

    if (rowAlertId === alertId) {
      const rowNumber = i + 1;
      const resolvedAt = new Date().toISOString();

      // Update H:K
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID!,
        range: `${ALERTS_TAB}!H${rowNumber}:K${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["resolved", alertId, "", resolvedAt]],
        },
      });

      return true;
    }
  }

  return false;
}
