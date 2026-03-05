// app/api/purchase/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { appendPurchaseRow, upsertCatalogRow } from "@/lib/purchases";
import { resolveToIngredientUpc } from "@/lib/barcodes/resolve";

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

/**
 * IMPORTANT (new rule):
 * - This endpoint may receive either:
 *   a) ingredient_upc (stable internal key) e.g. "EGG" / "PORK_BACON_SLICE"
 *   b) barcode_upc (scanned digits)        e.g. "012345678901"
 *
 * ✅ We ALWAYS write ingredient_upc to:
 * - Purchases ledger
 * - Catalog upsert
 *
 * barcode_upc is only used to resolve to ingredient_upc (via Barcode_Map first, then Catalog fallback).
 */
function normalizeCode(input: any) {
  return (input ?? "").toString().trim();
}

function pickString(body: any, keys: string[], fallback = "") {
  for (const k of keys) {
    const v = body?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return fallback;
}

function pickNumber(body: any, keys: string[], fallback = 0) {
  for (const k of keys) {
    const v = body?.[k];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

export async function POST(req: Request) {
  // Auth gate: allow either internal key OR Clerk user
  let enteredBy = "internal";
  if (!allowInternalKey(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const user = await currentUser();
    enteredBy =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      "clerk_user";
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // Accept both camelCase and snake_case request bodies
  const code = normalizeCode(pickString(body, ["upc", "code"]));
  const productName = pickString(body, ["productName", "product_name"]);

  const qtyPurchased = pickNumber(body, ["qtyPurchased", "qty_purchased"], 0);

  // Support either:
  // - unit price (price/unitPrice/unit_price)
  // - or total price (totalPrice/total_price)
  const unitPrice = pickNumber(body, ["unitPrice", "unit_price", "price"], NaN);
  const totalPriceProvided = pickNumber(
    body,
    ["totalPrice", "total_price"],
    NaN,
  );

  const totalPrice = Number.isFinite(totalPriceProvided)
    ? totalPriceProvided
    : Number.isFinite(unitPrice)
      ? qtyPurchased * unitPrice
      : 0;

  const storeVendor = pickString(body, ["storeVendor", "store_vendor"]);
  const assignedLocation = pickString(body, [
    "assignedLocation",
    "assigned_location",
  ]);

  const brand = pickString(body, ["brand"]);
  const sizeUnit = pickString(body, ["sizeUnit", "size_unit"]);
  const googleCategoryId = pickString(body, [
    "googleCategoryId",
    "google_category_id",
  ]);
  const googleCategoryName = pickString(body, [
    "googleCategoryName",
    "google_category_name",
  ]);
  const notes = pickString(body, ["notes"]);

  // --- Validation (input) ---
  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Missing upc" },
      { status: 400 },
    );
  }
  if (!productName) {
    return NextResponse.json(
      { ok: false, error: "Missing productName" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(qtyPurchased) || qtyPurchased <= 0) {
    return NextResponse.json(
      { ok: false, error: "qtyPurchased must be a number > 0" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    return NextResponse.json(
      { ok: false, error: "totalPrice must be a number >= 0" },
      { status: 400 },
    );
  }
  if (!storeVendor) {
    return NextResponse.json(
      { ok: false, error: "Missing storeVendor" },
      { status: 400 },
    );
  }
  if (assignedLocation !== "Kitchen" && assignedLocation !== "Front") {
    return NextResponse.json(
      { ok: false, error: "assignedLocation must be 'Kitchen' or 'Front'" },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();

  try {
    /**
     * ✅ Resolve code -> ingredient_upc
     *
     * Priority:
     * 1) Barcode_Map (barcode_upc -> ingredient_upc)
     * 2) Catalog fallback (Catalog.barcode_upc -> Catalog.upc)
     * 3) Catalog direct (Catalog.upc == code)
     *
     * If it looks like a barcode and isn't known, we reject so we don't
     * accidentally write a barcode as an ingredient_upc in the ledger.
     */
    const resolved = await resolveToIngredientUpc(code);

    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, error: resolved.error || "Resolve failed" },
        { status: 500 },
      );
    }

    if (!resolved.found) {
      // Safety rule: if it *looks* like a barcode, do not proceed.
      if (resolved.probably_barcode) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Unknown barcode. Add a mapping in Barcode_Map (or Catalog fallback) before purchasing.",
            code,
          },
          { status: 400 },
        );
      }

      // Otherwise treat it as a new ingredient_upc (pseudo key)
      // Example: "EGG" / "PORK_BACON_SLICE" entered manually.
      // This keeps your old behavior working for internal keys.
    }

    const ingredient_upc = resolved.found ? resolved.ingredient_upc : code;

    // --- Write ledger row (Purchases) ---
    // ✅ Always write ingredient_upc here, never the barcode.
    await appendPurchaseRow({
      timestamp: nowIso,
      entered_by: enteredBy,
      upc: ingredient_upc,
      product_name: productName,
      brand: brand || undefined,
      size_unit: sizeUnit || undefined,
      google_category_id: googleCategoryId || undefined,
      google_category_name: googleCategoryName || undefined,
      qty_purchased: qtyPurchased,
      total_price: totalPrice,
      store_vendor: storeVendor,
      assigned_location: assignedLocation as "Kitchen" | "Front",
      notes: notes || undefined,
    });

    /**
     * Catalog upsert:
     * - We keep Catalog keyed by ingredient_upc (stable)
     * - This endpoint does NOT auto-create Barcode_Map mappings.
     *   (Do that via POST /api/barcode/resolve so it’s explicit and auditable.)
     */
    await upsertCatalogRow({
      upc: ingredient_upc,
      product_name: productName,
      brand: brand || "",
      size_unit: sizeUnit || "",
      google_category_id: googleCategoryId || "",
      google_category_name: googleCategoryName || "",
      default_location: assignedLocation,
      preferred_vendor: storeVendor,
      notes: notes || "",
    });

    return NextResponse.json({
      ok: true,
      ingredient_upc,
      resolved: resolved.found
        ? { source: resolved.source }
        : { source: "direct" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Save failed" },
      { status: 500 },
    );
  }
}
