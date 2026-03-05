// app/api/catalog/item/route.ts
import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";
import { auth } from "@clerk/nextjs/server";
import { google } from "googleapis";

export const runtime = "nodejs";

/**
 * ✅ Goal of this route
 * - Support 2 IDs safely:
 *   1) ingredient_upc (stable internal key)  e.g. "PORK_BACON_SLICE"
 *   2) barcode_upc    (scannable UPC/EAN)   e.g. "012345678901"
 *
 * ✅ Rules to prevent breakage:
 * - All inventory math / recipes / state uses ingredient_upc ONLY.
 * - barcode_upc is only an alias used for lookups at input time.
 * - POST must NEVER create a Catalog row where Catalog.upc is a barcode.
 *   If a barcode is unknown, caller must provide body.ingredient_upc to attach/create safely.
 */

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
 * Heuristic: if it’s 11–14 digits, treat as “probably barcode”
 * - UPC-A: 12
 * - EAN-13: 13
 * - GTIN-14: 14
 * Some systems store 11 (missing leading 0), so allow 11 too.
 */
function isProbablyBarcode(v: string) {
  const s = norm(v);
  return /^\d{11,14}$/.test(s);
}

/**
 * Find a Catalog row by either:
 * - Catalog.upc (ingredient_upc / pseudo key)
 * - Catalog.barcode_upc (real barcode)
 */
function findCatalogRowByEither(catalogRows: any[], query: string) {
  const q = up(query);

  // Match canonical ingredient key first (fast + deterministic)
  const byIngredient = catalogRows.find((r) => up(r?.["upc"]) === q) ?? null;
  if (byIngredient) return byIngredient;

  // Then match barcode
  const byBarcode =
    catalogRows.find((r) => up(r?.["barcode_upc"]) === q) ?? null;
  return byBarcode;
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
    const row = findCatalogRowByEither(catalog.rows, queryUpc);

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
 *
 * ✅ Safe rules:
 * - If body.upc is an ingredient key → update/create that item.
 * - If body.upc is a BARCODE:
 *    - If barcode is already mapped in Catalog.barcode_upc → update that item.
 *    - If barcode is NOT found:
 *        - You MUST provide body.ingredient_upc to create/attach safely.
 *        - Otherwise we refuse (to prevent creating a catalog row whose "upc" is a barcode).
 *
 * Auth:
 * - Clerk user OR internal key
 *
 * Body examples:
 *
 * 1) Update by ingredient key (existing behavior)
 * {
 *   "upc": "EGG",
 *   "patch": { "reorder_point": 30 }
 * }
 *
 * 2) Attach a new barcode to an existing ingredient item
 * {
 *   "upc": "EGG",
 *   "patch": { "barcode_upc": "012345678901" }
 * }
 *
 * 3) Scan-based attach (barcode unknown → require ingredient_upc)
 * {
 *   "upc": "012345678901",
 *   "ingredient_upc": "PORK_BACON_SLICE",
 *   "patch": { "barcode_upc": "012345678901", "product_name": "Bacon", "base_unit": "each" }
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

    const queryRaw = norm(body?.upc);
    const query = up(queryRaw);

    if (!query) {
      return NextResponse.json(
        { ok: false, error: "Missing body.upc" },
        { status: 400 },
      );
    }

    // Optional explicit canonical ingredient key (used for safe create/attach when scanning)
    const explicitIngredientUpc = up(body?.ingredient_upc);

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
      "barcode_upc", // ✅ barcode alias
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

    /**
     * ✅ Resolve:
     * - If query matches Catalog.upc → use it
     * - Else if query matches Catalog.barcode_upc → use that row's Catalog.upc
     * - Else (not found):
     *    - If query looks like barcode AND no ingredient_upc provided → refuse
     *    - Else treat query as ingredient_upc for create/update
     */
    const catalogObj = await readTabAsObjects("Catalog");
    const foundObjRow = findCatalogRowByEither(catalogObj.rows, query);

    const resolvedIngredientUpc =
      up(foundObjRow?.["upc"]) || explicitIngredientUpc || "";

    const queryLooksLikeBarcode = isProbablyBarcode(query);

    if (!foundObjRow && queryLooksLikeBarcode && !explicitIngredientUpc) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Barcode not found in Catalog. Provide body.ingredient_upc to create/attach this barcode safely.",
          upc: query,
        },
        { status: 400 },
      );
    }

    // If not found, and explicitIngredientUpc exists, we create/update that canonical key.
    // If not found, and query is NOT a barcode, we assume query IS the ingredient key.
    const canonicalUpc =
      resolvedIngredientUpc || (queryLooksLikeBarcode ? "" : query);

    if (!canonicalUpc) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unable to resolve canonical ingredient_upc. Provide body.ingredient_upc.",
          upc: query,
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

    // Pull sheet values to find existing row by UPC (CANONICAL ingredient key ONLY)
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${TAB}!A:Z`,
    });

    const values = valuesRes.data.values || [];
    const upcIdx = headerKeyToIndex.get("upc")!;

    let foundRowIndex = -1; // 0-based index inside `values`
    for (let r = 1; r < values.length; r++) {
      const rowUpc = up(values[r]?.[upcIdx]);
      if (rowUpc === canonicalUpc) {
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
        // Keep digits only when it's truly a barcode-like value; otherwise allow the raw.
        const raw = norm(v);
        const digits = raw.replace(/\D/g, "");
        return digits || raw;
      }
      return norm(v);
    };

    // Determine update range width based on headers we have (use header length)
    const lastColLetter = colToA1(Math.max(0, rawHeaders.length - 1));

    // If caller used barcode query, and they are NOT explicitly patching barcode_upc,
    // we should still allow them to update other fields on the resolved ingredient row.
    // But if they DID provide ingredient_upc and a barcode, we usually want to attach it.
    if (queryLooksLikeBarcode) {
      // If scanning flow, default attach scanned barcode to row unless explicitly set differently.
      if (cleanedPatch["barcode_upc"] === undefined) {
        cleanedPatch["barcode_upc"] = queryRaw; // preserve original casing/digits
      }
    }

    if (foundRowIndex !== -1) {
      // UPDATE existing row
      const row = values[foundRowIndex] ? [...values[foundRowIndex]] : [];
      while (row.length < rawHeaders.length) row.push("");

      // Always ensure canonical upc is set correctly
      row[upcIdx] = canonicalUpc;

      // If product_name is missing and not provided, default to UPC
      const nameIdx = headerKeyToIndex.get("product_name")!;
      if (!norm(row[nameIdx]) && cleanedPatch["product_name"] === undefined) {
        row[nameIdx] = canonicalUpc;
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
        // what caller asked with
        query: queryRaw,
        query_type: queryLooksLikeBarcode ? "barcode_upc" : "ingredient_upc",

        // canonical
        ingredient_upc: canonicalUpc,

        created: false,
        updated: true,
        rowNumber: sheetRowNumber,
        applied: cleanedPatch,
      });
    }

    // APPEND new row (ONLY allowed when canonicalUpc is an ingredient key)
    // If the query looked like a barcode, we required explicitIngredientUpc earlier.
    const newRow = new Array(rawHeaders.length).fill("");

    newRow[upcIdx] = canonicalUpc;

    const nameIdx = headerKeyToIndex.get("product_name")!;
    newRow[nameIdx] = coerce(
      "product_name",
      cleanedPatch["product_name"] ?? canonicalUpc,
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
      query: queryRaw,
      query_type: queryLooksLikeBarcode ? "barcode_upc" : "ingredient_upc",
      ingredient_upc: canonicalUpc,

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
