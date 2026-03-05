// app/api/barcode/resolve/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { google } from "googleapis";
import { resolveToIngredientUpc } from "@/lib/barcodes/resolve";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function up(v: any) {
  return norm(v).toUpperCase();
}

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

// --- Google Sheets helpers (local to this route) ---
function getSheetsClient() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

  if (!sheetId) throw new Error("Missing env: GOOGLE_SHEET_ID");
  if (!base64)
    throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");

  const creds = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, sheetId };
}

function colToA1(colIndexZeroBased: number) {
  // 0 -> A, 1 -> B, ... 25 -> Z, 26 -> AA
  let n = colIndexZeroBased + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function normalizeHeaderKey(h: any) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * GET /api/barcode/resolve?code=012345678901
 * GET /api/barcode/resolve?code=EGG
 *
 * ✅ Returns canonical ingredient_upc when found.
 * ✅ Uses Barcode_Map first, then Catalog fallback.
 */
export async function GET(req: Request) {
  const { userId } = await auth();

  if (!userId && !allowInternalKey(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(req.url);
    const code = norm(url.searchParams.get("code"));
    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Missing ?code=" },
        { status: 400 },
      );
    }

    const res = await resolveToIngredientUpc(code);
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "barcode.resolve.get",
        error: err?.message || "Error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/barcode/resolve
 *
 * Attach or update a barcode mapping.
 *
 * Body:
 * {
 *   "barcode_upc": "012345678901",
 *   "ingredient_upc": "PORK_BACON_SLICE",
 *   "active": true,
 *   "notes": "Vendor swap",
 * }
 *
 * Behavior:
 * - Upserts by barcode_upc in Barcode_Map
 * - Updates last_seen = now
 */
export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId && !allowInternalKey(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json().catch(() => null);

    const barcode_upc_raw = norm(body?.barcode_upc);
    const ingredient_upc_raw = norm(body?.ingredient_upc);

    const barcode_upc = barcode_upc_raw.replace(/\D/g, ""); // barcodes should be digits
    const ingredient_upc = up(ingredient_upc_raw);

    if (!barcode_upc) {
      return NextResponse.json(
        { ok: false, error: "Missing body.barcode_upc" },
        { status: 400 },
      );
    }
    if (!ingredient_upc) {
      return NextResponse.json(
        { ok: false, error: "Missing body.ingredient_upc" },
        { status: 400 },
      );
    }

    const active =
      typeof body?.active === "boolean"
        ? body.active
        : up(body?.active) !== "FALSE";

    const notes = norm(body?.notes);

    const { sheets, sheetId } = getSheetsClient();
    const TAB = "Barcode_Map";

    // Read header row (header-driven)
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${TAB}!1:1`,
    });

    const rawHeaders = (headerRes.data.values?.[0] || []).map((h) =>
      String(h ?? "").trim(),
    );
    if (rawHeaders.length === 0) {
      throw new Error("Barcode_Map sheet missing header row");
    }

    const headerKeyToIndex = new Map<string, number>();
    rawHeaders.forEach((h, i) => {
      const key = normalizeHeaderKey(h);
      if (key) headerKeyToIndex.set(key, i);
    });

    // Required headers
    for (const h of ["barcode_upc", "ingredient_upc", "active", "last_seen"]) {
      if (!headerKeyToIndex.has(h)) {
        throw new Error(`Barcode_Map missing required header: ${h}`);
      }
    }

    const barcodeIdx = headerKeyToIndex.get("barcode_upc")!;
    const ingredientIdx = headerKeyToIndex.get("ingredient_upc")!;
    const activeIdx = headerKeyToIndex.get("active")!;
    const notesIdx = headerKeyToIndex.get("notes"); // optional
    const lastSeenIdx = headerKeyToIndex.get("last_seen")!;

    // Pull values to find existing row by barcode_upc
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${TAB}!A:Z`,
    });

    const values = valuesRes.data.values || [];

    let foundRowIndex = -1; // 0-based
    for (let r = 1; r < values.length; r++) {
      const rowBarcode = String(values[r]?.[barcodeIdx] ?? "").replace(
        /\D/g,
        "",
      );
      if (rowBarcode === barcode_upc) {
        foundRowIndex = r;
        break;
      }
    }

    const nowIso = new Date().toISOString();
    const lastColLetter = colToA1(Math.max(0, rawHeaders.length - 1));

    if (foundRowIndex !== -1) {
      // UPDATE row
      const row = values[foundRowIndex] ? [...values[foundRowIndex]] : [];
      while (row.length < rawHeaders.length) row.push("");

      row[barcodeIdx] = barcode_upc;
      row[ingredientIdx] = ingredient_upc;
      row[activeIdx] = active ? "true" : "false";
      row[lastSeenIdx] = nowIso;
      if (notesIdx !== undefined) row[notesIdx] = notes;

      const sheetRowNumber = foundRowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${TAB}!A${sheetRowNumber}:${lastColLetter}${sheetRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row.slice(0, rawHeaders.length)] },
      });

      return NextResponse.json({
        ok: true,
        updated: true,
        created: false,
        barcode_upc,
        ingredient_upc,
        active,
        last_seen: nowIso,
      });
    }

    // APPEND row
    const newRow = new Array(rawHeaders.length).fill("");
    newRow[barcodeIdx] = barcode_upc;
    newRow[ingredientIdx] = ingredient_upc;
    newRow[activeIdx] = active ? "true" : "false";
    newRow[lastSeenIdx] = nowIso;
    if (notesIdx !== undefined) newRow[notesIdx] = notes;

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${TAB}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [newRow] },
    });

    return NextResponse.json({
      ok: true,
      updated: false,
      created: true,
      barcode_upc,
      ingredient_upc,
      active,
      last_seen: nowIso,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "barcode.resolve.post",
        error: err?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
