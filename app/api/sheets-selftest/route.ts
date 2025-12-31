import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

function getServiceAccount() {
  // ✅ Prefer Base64
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (b64) {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (parsed.private_key)
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  }

  // Fallback: raw JSON
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw)
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 (or GOOGLE_SERVICE_ACCOUNT_JSON)"
    );

  const trimmed = raw.trim();
  const unwrapped =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;

  const parsed = JSON.parse(unwrapped);
  if (parsed.private_key)
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

export async function GET() {
  try {
    const sheetId = process.env.SHEET_ID;
    if (!sheetId) throw new Error("Missing SHEET_ID");

    const creds = getServiceAccount();

    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });

    return NextResponse.json({
      ok: true,
      title: res.data.properties?.title,
      serviceAccountEmail: creds.client_email,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
