// lib/sheets/auth.ts
import { google } from "googleapis";

type SAJson = {
  client_email: string;
  private_key: string;
};

export function getSheetsAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!b64) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

  // Decode base64 -> JSON
  const jsonStr = Buffer.from(b64, "base64").toString("utf8");
  const sa = JSON.parse(jsonStr) as SAJson;

  if (!sa.client_email)
    throw new Error("Service account JSON missing client_email");
  if (!sa.private_key)
    throw new Error("Service account JSON missing private_key");

  return new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}
