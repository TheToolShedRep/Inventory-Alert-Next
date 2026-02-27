// Varification script for Google Sheets data

// scripts/verify-env.mjs
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.local explicitly (because Node won't load it automatically)
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // fallback (optional) if you ever use .env
  dotenv.config();
}

const required = [
  "GOOGLE_SHEET_ID",
  "ALERTS_TAB",
  "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
  "ONESIGNAL_APP_ID",
  "ONESIGNAL_API_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
];

const missing = required.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("✅ env ok");

