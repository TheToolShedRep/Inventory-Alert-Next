// lib/sheets.ts
import { google } from "googleapis";

/**
 * ============================
 * ENV
 * ============================
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
 */
const BUSINESS_TIMEZONE = "America/New_York";

/**
 * ============================
 * Alerts sheet columns
 * ============================
 * Baseline columns A:K
 * A timestamp
 * B item
 * C qty
 * D location
 * E note
 * F ip
 * G user_agent
 * H status
 * I alert_id
 * J canceled_at
 * K resolved_at
 *
 * Optional column (if present):
 * L source
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
  source?: string; // optional
};

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
 * Detect whether Alerts sheet has a `source` column (L) by reading header row.
 */
async function hasSourceColumn(sheets: any): Promise<boolean> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
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
 * Append an alert row (positional, stable)
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
      ...(includeSource ? [(source ?? "").toLowerCase()] : []), // L (optional)
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
 * Read all alerts (A:K + optional L)
 */
export async function getAllAlerts(): Promise<AlertRow[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
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
 * Cancel/Resolve by alertId (positional)
 * alert_id is column I (index 8)
 * status/canceled_at/resolved_at are H/J/K (indexes 7/9/10)
 */
async function updateAlertStatusById(
  alertId: string,
  nextStatus: "canceled" | "resolved",
): Promise<boolean> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
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

      // Update H:K (status, alert_id, canceled_at, resolved_at)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID!,
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
