import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    hasSheetId: Boolean(process.env.GOOGLE_SHEET_ID),
    hasServiceJson: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    hasServiceB64: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64),
    hasOneSignalAppId: Boolean(process.env.ONESIGNAL_APP_ID),
    hasOneSignalKey: Boolean(process.env.ONESIGNAL_API_KEY),
  });
}
