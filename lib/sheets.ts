import { google } from "googleapis";

/**
 * Env
 */
const SHEET_ID = process.env.SHEET_ID!;
const SHEET_TAB = process.env.SHEET_TAB!;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64!;

/**
 * Row type (camelCase in code; snake_case headers in Sheets is fine)
 */
export type AlertRow = {
  timestamp: string;
  item: string;
  qty: string;
  location: string;
  note: string;
  ip: string;
  userAgent: string; // maps to user_agent column in Sheets
  status: "active" | "canceled";
  alertId: string; // maps to alert_id
  canceledAt: string; // maps to canceled_at
};

/**
 * Sheets client
 */
function getSheetsClient() {
  const creds = JSON.parse(
    Buffer.from(SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8")
  );

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Append an alert row to the sheet
 * Matches columns A:J exactly.
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
  qty: string;
  location: string;
  note?: string;
  ip?: string;
  userAgent?: string;
  alertId: string;
}) {
  const sheets = getSheetsClient();
  const timestamp = new Date().toISOString();

  // Sheet columns A:J
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
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/**
 * Read all alerts from sheet
 */
export async function getAllAlerts(): Promise<AlertRow[]> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:J`, // A through J
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
    ] = r;

    // Normalize status strictly
    const normalizedStatus: "active" | "canceled" =
      status === "canceled" ? "canceled" : "active";

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
    };
  });
}

/**
 * Get today's alerts (excluding canceled)
 */
export async function getTodayAlerts(): Promise<AlertRow[]> {
  const all = await getAllAlerts();
  const today = new Date().toISOString().slice(0, 10);

  return all.filter(
    (r) => r.timestamp.startsWith(today) && r.status !== "canceled"
  );
}

/**
 * Get deduped checklist for today (by item+location)
 * Picks the latest alert for each item+location
 */
export async function getTodayChecklist(): Promise<AlertRow[]> {
  const alerts = await getTodayAlerts();
  const map = new Map<string, AlertRow>();

  for (const alert of alerts) {
    const key = `${alert.item}|${alert.location}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, alert);
      continue;
    }

    // Prefer the latest timestamp
    if (alert.timestamp > existing.timestamp) {
      map.set(key, alert);
    }
  }

  return Array.from(map.values());
}

/**
 * Cancel an alert by alertId (soft cancel)
 * - Finds matching row by I column (alert_id)
 * - Updates H:J (status, alert_id, canceled_at)
 */
export async function cancelAlertById(alertId: string): Promise<boolean> {
  const sheets = getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:J`,
  });

  const values = res.data.values || [];
  if (values.length <= 1) return false;

  // Start at 1 because 0 is headers
  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    // I column is index 8 (0-based)
    const rowAlertId = row[8];

    if (rowAlertId === alertId) {
      const rowNumber = i + 1; // sheet rows are 1-based
      const canceledAt = new Date().toISOString();

      // Update columns H:J (status, alert_id, canceled_at)
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!H${rowNumber}:J${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [["canceled", alertId, canceledAt]],
        },
      });

      return true;
    }
  }

  return false;
}
