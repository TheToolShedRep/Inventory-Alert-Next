// lib/subscribers.ts
import { google } from "googleapis";

function getServiceAccountClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

  const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));

  return new google.auth.JWT({
    email: json.client_email,
    key: json.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

const SUBSCRIBERS_TAB = process.env.SUBSCRIBERS_TAB || "subscribers";

export async function addSubscriberEmail(email: string) {
  const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!GOOGLE_SHEET_ID) throw new Error("Missing env: GOOGLE_SHEET_ID");

  const auth = getServiceAccountClient();
  const sheets = google.sheets({ version: "v4", auth });

  // 1) Read existing emails to avoid duplicates
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SUBSCRIBERS_TAB}!A2:A`,
  });

  const existing = new Set(
    (existingRes.data.values || [])
      .map((row) =>
        String(row?.[0] || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );

  const normalized = email.trim().toLowerCase();
  if (!normalized) return { ok: false, reason: "empty-email" };

  if (existing.has(normalized)) {
    return { ok: true, already: true };
  }

  // 2) Append new subscriber
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SUBSCRIBERS_TAB}!A:B`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[normalized, new Date().toISOString()]],
    },
  });

  return { ok: true, already: false };
}

export async function getSubscriberEmails() {
  const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!GOOGLE_SHEET_ID) throw new Error("Missing env: GOOGLE_SHEET_ID");

  const auth = getServiceAccountClient();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SUBSCRIBERS_TAB}!A2:A`,
  });

  const emails = (res.data.values || [])
    .map((row) =>
      String(row?.[0] || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  // de-dupe just in case
  return Array.from(new Set(emails));
}
