// app/api/catalog/item/route.ts
import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";
import { auth } from "@clerk/nextjs/server";
import { google } from "googleapis";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function up(v: any) {
  return norm(v).toUpperCase();
}

function toNumber(v: any) {
  const s = norm(v);
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

// --- Google Sheets helpers (local to this route for speed / minimal dependencies) ---
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
 * GET /api/catalog/item?upc=EGG
 * GET /api/catalog/item?upc=012345678901  (barcode_upc)
 *
 * ✅ Supports BOTH:
 * - Catalog.upc (pseudo/ingredient key like "EGG")
 * - Catalog.barcode_upc (real scannable UPC like "012345678901")
 *
 * Returns:
 * - ingredient_upc: always the pseudo key (Catalog.upc)
 * - barcode_upc: whatever is stored on the row (if present)
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
    const queryUpc = up(url.searchParams.get("upc"));

    if (!queryUpc) {
      return NextResponse.json(
        { ok: false, error: "Missing ?upc=EGG" },
        { status: 400 },
      );
    }

    const catalog = await readTabAsObjects("Catalog");

    // ✅ Match by pseudo upc OR barcode_upc
    const row = catalog.rows.find((r) => {
      const pseudo = up(r["upc"]);
      const barcode = up(r["barcode_upc"]);
      return pseudo === queryUpc || barcode === queryUpc;
    });

    if (!row) {
      return NextResponse.json({
        ok: true,
        found: false,
        upc: queryUpc,
      });
    }

    const ingredient_upc = up(row["upc"]) || queryUpc;

    return NextResponse.json({
      ok: true,
      found: true,

      // echo what the user asked for
      upc: queryUpc,

      // ✅ canonical key used by Recipes/inventory math
      ingredient_upc,

      // optional (debug/visibility)
      barcode_upc: norm(row["barcode_upc"]) || "",

      product_name: norm(row["product_name"]) || ingredient_upc,
      base_unit: norm(row["base_unit"]) || "",
      reorder_point: toNumber(row["reorder_point"]),
      par_level: toNumber(row["par_level"]),
      default_location: norm(row["default_location"]) || "",
      preferred_vendor: norm(row["preferred_vendor"]) || "",
      active: norm(row["active"]) || "",
      notes: norm(row["notes"]) || "",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "catalog-item",
        error: err?.message || "Server error",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/catalog/item
 * “Calibration without calibration log”:
 * - Updates the Catalog row for a UPC (reorder_point/par_level/vendor/location/etc)
 * - If UPC row doesn't exist, creates it (header-driven)
 *
 * ✅ Also allows patching "barcode_upc" now (safe because you appended it to the end)
 *
 * Auth:
 * - Clerk user OR internal key
 *
 * Body example:
 * {
 *   "upc": "EGG",
 *   "patch": {
 *     "reorder_point": 30,
 *     "par_level": 60,
 *     "preferred_vendor": "Walmart",
 *     "default_location": "Kitchen",
 *     "notes": "Calibrated after running out early",
 *     "barcode_upc": "012345678901"
 *   }
 * }
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
    const upc = up(body?.upc);

    if (!upc) {
      return NextResponse.json(
        { ok: false, error: "Missing body.upc" },
        { status: 400 },
      );
    }

    const patch = body?.patch ?? {};
    if (!patch || typeof patch !== "object") {
      return NextResponse.json(
        { ok: false, error: "Missing body.patch object" },
        { status: 400 },
      );
    }

    // Allowed fields to update in Catalog
    const allowedKeys = new Set([
      "product_name",
      "base_unit",
      "reorder_point",
      "par_level",
      "preferred_vendor",
      "default_location",
      "active",
      "notes",
      "barcode_upc", // ✅ NEW
    ]);

    const cleanedPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      const key = normalizeHeaderKey(k);
      if (!allowedKeys.has(key)) continue;
      cleanedPatch[key] = v;
    }

    if (Object.keys(cleanedPatch).length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No valid patch fields. Allowed: reorder_point, par_level, preferred_vendor, default_location, product_name, base_unit, active, notes, barcode_upc",
        },
        { status: 400 },
      );
    }

    const { sheets, sheetId } = getSheetsClient();
    const TAB = "Catalog";

    // Read header row to know which columns exist
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${TAB}!1:1`,
    });

    const rawHeaders = (headerRes.data.values?.[0] || []).map((h) =>
      String(h ?? "").trim(),
    );
    if (rawHeaders.length === 0) {
      throw new Error("Catalog sheet missing header row");
    }

    const headerKeyToIndex = new Map<string, number>();
    rawHeaders.forEach((h, i) => {
      const key = normalizeHeaderKey(h);
      if (key) headerKeyToIndex.set(key, i);
    });

    // Must have upc + product_name to operate sanely (product_name can be auto-filled)
    if (!headerKeyToIndex.has("upc")) {
      throw new Error("Catalog missing required header: upc");
    }
    if (!headerKeyToIndex.has("product_name")) {
      throw new Error("Catalog missing required header: product_name");
    }

    // Pull sheet values to find existing row by UPC (pseudo upc only)
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${TAB}!A:Z`,
    });

    const values = valuesRes.data.values || [];
    const upcIdx = headerKeyToIndex.get("upc")!;

    let foundRowIndex = -1; // 0-based index inside `values`
    for (let r = 1; r < values.length; r++) {
      const rowUpc = up(values[r]?.[upcIdx]);
      if (rowUpc === upc) {
        foundRowIndex = r;
        break;
      }
    }

    // Helper to coerce certain fields
    const coerce = (key: string, v: any) => {
      if (key === "reorder_point" || key === "par_level") {
        const n = toNumber(v);
        return n === null ? "" : String(n);
      }
      if (key === "active") {
        if (typeof v === "boolean") return v ? "true" : "false";
        return norm(v);
      }
      if (key === "barcode_upc") {
        // keep digits only (common for UPC/EAN), but don't force it if you want alphanumerics
        const digits = String(v ?? "").replace(/\D/g, "");
        return digits || norm(v);
      }
      return norm(v);
    };

    // Determine update range width based on headers we have (use header length)
    const lastColLetter = colToA1(Math.max(0, rawHeaders.length - 1));

    if (foundRowIndex !== -1) {
      // UPDATE existing row
      const row = values[foundRowIndex] ? [...values[foundRowIndex]] : [];
      while (row.length < rawHeaders.length) row.push("");

      // Always ensure upc is set correctly
      row[upcIdx] = upc;

      // If product_name is missing and not provided, default to UPC
      const nameIdx = headerKeyToIndex.get("product_name")!;
      if (!norm(row[nameIdx]) && cleanedPatch["product_name"] === undefined) {
        row[nameIdx] = upc;
      }

      for (const [k, v] of Object.entries(cleanedPatch)) {
        const idx = headerKeyToIndex.get(k);
        if (idx === undefined) continue; // column not present in this Catalog sheet
        row[idx] = coerce(k, v);
      }

      const sheetRowNumber = foundRowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${TAB}!A${sheetRowNumber}:${lastColLetter}${sheetRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row.slice(0, rawHeaders.length)] },
      });

      return NextResponse.json({
        ok: true,
        upc,
        created: false,
        updated: true,
        rowNumber: sheetRowNumber,
        applied: cleanedPatch,
      });
    }

    // APPEND new row
    const newRow = new Array(rawHeaders.length).fill("");

    newRow[upcIdx] = upc;

    const nameIdx = headerKeyToIndex.get("product_name")!;
    newRow[nameIdx] = coerce(
      "product_name",
      cleanedPatch["product_name"] ?? upc,
    );

    for (const [k, v] of Object.entries(cleanedPatch)) {
      const idx = headerKeyToIndex.get(k);
      if (idx === undefined) continue;
      newRow[idx] = coerce(k, v);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${TAB}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [newRow] },
    });

    return NextResponse.json({
      ok: true,
      upc,
      created: true,
      updated: false,
      applied: cleanedPatch,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "catalog-item.post",
        error: err?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
