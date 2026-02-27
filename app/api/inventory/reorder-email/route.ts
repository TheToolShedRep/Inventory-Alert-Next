// app/api/inventory/reorder-email/route.ts
import { NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";

import { readTabAsObjects } from "@/lib/sheets/read";
import { sendAlertEmail } from "@/lib/email";
import { requireInternalKey } from "@/lib/auth/internal";
import { getBusinessDateNY, getShoppingList } from "@/lib/sheets-core";

export const runtime = "nodejs";

/**
 * ============================
 * Small helpers
 * ============================
 */
function norm(v: any) {
  return String(v ?? "").trim();
}

function toNumber(v: any) {
  const s = norm(v);
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatNY(dt: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
}

/**
 * ============================
 * Google Sheets client (for logging)
 * ============================
 */
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

function getSheetsClient() {
  if (!GOOGLE_SHEET_ID) throw new Error("Missing env: GOOGLE_SHEET_ID");
  if (!SERVICE_ACCOUNT_BASE64)
    throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

  const creds = JSON.parse(
    Buffer.from(SERVICE_ACCOUNT_BASE64, "base64").toString("utf-8"),
  );

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/**
 * Header-driven append to Reorder_Email_Log
 * Expected headers:
 * timestamp | business_date | items | recipients | actor | request_id | items_hash
 */
async function appendReorderEmailLogRow(input: {
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
    if (!h) return;
    indexByHeader.set(h.toLowerCase(), i);
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
      `Reorder_Email_Log missing headers: ${missing.join(
        ", ",
      )}. Found: ${rawHeaders.join(" | ")}`,
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
 * Read log and decide if we should send.
 * Spam resistance:
 * - Default: once per NY business day
 * - Cooldown: blocks repeated sends within N minutes (even if force is not used)
 * - force=1 bypasses "already sent today", but still respects cooldown unless force=2
 */
async function shouldSendReorderEmail(opts: {
  businessDate: string;
  cooldownMinutes: number;
  forceLevel: 0 | 1 | 2;
}) {
  const log = await readTabAsObjects("Reorder_Email_Log");

  const rows = (log.rows || []).map((r: any) => ({
    timestamp: norm(r["timestamp"]),
    business_date: norm(r["business_date"]),
    items_hash: norm(r["items_hash"]),
  }));

  const now = new Date();
  const cutoffMs = opts.cooldownMinutes * 60 * 1000;

  let lastSentAt: Date | null = null;
  let lastBusinessDate: string | null = null;

  for (const r of rows) {
    const t = Date.parse(r.timestamp);
    if (Number.isNaN(t)) continue;
    const d = new Date(t);
    if (!lastSentAt || d.getTime() > lastSentAt.getTime()) {
      lastSentAt = d;
      lastBusinessDate = r.business_date || null;
    }
  }

  if (lastSentAt && opts.forceLevel < 2) {
    const age = now.getTime() - lastSentAt.getTime();
    if (age >= 0 && age < cutoffMs) {
      return {
        okToSend: false as const,
        reason: "cooldown" as const,
        lastSentAtISO: lastSentAt.toISOString(),
        lastBusinessDate,
      };
    }
  }

  const sentToday = rows.some((r) => r.business_date === opts.businessDate);
  if (sentToday && opts.forceLevel === 0) {
    return {
      okToSend: false as const,
      reason: "already_sent_today" as const,
      lastSentAtISO: lastSentAt?.toISOString() ?? null,
      lastBusinessDate,
    };
  }

  return {
    okToSend: true as const,
    reason: "ok" as const,
    lastSentAtISO: lastSentAt?.toISOString() ?? null,
    lastBusinessDate,
  };
}

export async function GET(req: Request) {
  const deny = requireInternalKey(req);
  if (deny) return deny;

  const started = Date.now();

  try {
    const url = new URL(req.url);

    // ✅ test=1 means: show full merged list (includeHidden=true) so testing doesn't get fooled by state
    const testMode = url.searchParams.get("test") === "1";

    // force=1 => bypass "already sent today"
    // force=2 => bypass "already sent today" + bypass cooldown
    const forceParam = norm(url.searchParams.get("force"));
    const forceLevel: 0 | 1 | 2 =
      forceParam === "2" ? 2 : forceParam === "1" ? 1 : 0;

    const cooldownMinutes = Math.max(
      1,
      Number(url.searchParams.get("cooldownMinutes") || 15),
    );

    const businessDate = getBusinessDateNY();

    const gate = await shouldSendReorderEmail({
      businessDate,
      cooldownMinutes,
      forceLevel,
    });

    if (!gate.okToSend) {
      return NextResponse.json({
        ok: true,
        scope: "reorder-email",
        skipped: true,
        reason: gate.reason,
        businessDate,
        cooldownMinutes,
        last_sent_at: gate.lastSentAtISO,
        last_business_date: gate.lastBusinessDate,
        test: testMode,
        ms: Date.now() - started,
      });
    }

    const subs = await readTabAsObjects("Subscribers");
    const emails = (subs.rows || [])
      .map((r: any) => norm(r["email"]))
      .filter((e: string) => e.includes("@"));

    if (emails.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          scope: "reorder-email",
          error: "No subscriber emails found",
        },
        { status: 400 },
      );
    }

    /**
     * IMPORTANT:
     * test=1 => includeHidden=true so testing always shows the full merged list.
     * normal => includeHidden=false (real behavior).
     */
    const list = await getShoppingList({ includeHidden: testMode });

    const items = (list || []).map((r: any) => ({
      upc: norm(r["upc"] ?? r.upc),
      product_name: norm(r["product_name"] ?? r.product_name),
      on_hand: toNumber(r["on_hand_base_units"] ?? r.on_hand_base_units),
      base_unit: norm(r["base_unit"] ?? r.base_unit) || "each",
      reorder_point: toNumber(r["reorder_point"] ?? r.reorder_point),
      par_level: toNumber(r["par_level"] ?? r.par_level),
      qty_to_order: toNumber(
        r["qty_to_order_base_units"] ?? r.qty_to_order_base_units,
      ),
      preferred_vendor: norm(r["preferred_vendor"] ?? r.preferred_vendor),
      default_location: norm(r["default_location"] ?? r.default_location),
      note: norm(r["note"] ?? r.note),
    }));

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        scope: "reorder-email",
        message: "No items flagged. Nothing emailed.",
        emailed_to: 0,
        items: 0,
        businessDate,
        test: testMode,
        ms: Date.now() - started,
      });
    }

    const subjectPrefix = testMode ? "[TEST] " : "";
    const subject = `${subjectPrefix}Shopping List (${items.length} item${
      items.length === 1 ? "" : "s"
    })`;

    const rowsHtml = items
      .map((it) => {
        const vendor = it.preferred_vendor ? ` • ${it.preferred_vendor}` : "";
        const loc = it.default_location ? ` • ${it.default_location}` : "";
        const note = it.note ? ` • <strong>NOTE:</strong> ${it.note}` : "";
        const par = it.par_level > 0 ? ` • Par: ${it.par_level}` : "";

        return `
          <li>
            <strong>${it.product_name}</strong> (${it.upc}) —
            On hand: ${it.on_hand} ${it.base_unit} •
            Reorder @ ${it.reorder_point}${par} •
            Order: <strong>${it.qty_to_order}</strong>
            ${vendor}${loc}${note}
          </li>
        `;
      })
      .join("");

    const requestId = crypto.randomUUID();

    const itemsHash = crypto
      .createHash("sha256")
      .update(
        items
          .map((i) => `${i.upc}:${i.qty_to_order}`)
          .sort()
          .join("|"),
      )
      .digest("hex")
      .slice(0, 16);

    const html = `
      <h2>${testMode ? "Shopping List (TEST MODE)" : "Shopping List"}</h2>
      <p><strong>Business date (NY):</strong> ${businessDate}</p>
      <p><strong>Generated (NY):</strong> ${formatNY(new Date())}</p>
      <ul>${rowsHtml}</ul>
      <p style="opacity:0.7;">Request: ${requestId} • Hash: ${itemsHash}</p>
      <p>— Inventory Alert System</p>
    `;

    const sendRes = await sendAlertEmail({
      to: emails,
      subject,
      html,
    });

    await appendReorderEmailLogRow({
      timestamp: new Date().toISOString(),
      business_date: businessDate,
      items: items.length,
      recipients: emails.length,
      actor: testMode ? "internal_key_test" : "internal_key",
      request_id: requestId,
      items_hash: itemsHash,
    });

    return NextResponse.json({
      ok: true,
      scope: "reorder-email",
      businessDate,
      emailed_to: emails.length,
      items: items.length,
      request_id: requestId,
      items_hash: itemsHash,
      send_result: sendRes,
      test: testMode,
      ms: Date.now() - started,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "reorder-email",
        error: e?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
