// app/api/purchase/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { appendPurchaseRow, upsertCatalogRow } from "@/lib/purchases";

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

/**
 * We currently support two UPC styles:
 * 1) Real barcode UPCs (digits)
 * 2) Pseudo-UPCs (internal keys) like "EGG", "CROISSANT", "PORK_BACON_SLICE"
 *
 * So we DO NOT strip non-digits. We just trim.
 */
function normalizeUpc(input: any) {
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
  // ✅ Auth gate: allow either internal key OR Clerk user
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
  const upc = normalizeUpc(pickString(body, ["upc"]));
  const productName = pickString(body, ["productName", "product_name"]);

  const qtyPurchased = pickNumber(body, ["qtyPurchased", "qty_purchased"], 0);

  // Support either:
  // - UI sending unit price (often called "price" or "unitPrice")
  // - API callers sending total_price/totalPrice
  const unitPrice = pickNumber(body, ["unitPrice", "unit_price", "price"], NaN);
  const totalPriceProvided = pickNumber(
    body,
    ["totalPrice", "total_price"],
    NaN,
  );

  // Compute total price safely:
  // - If total price is provided, use it.
  // - Else if unit price is provided, compute.
  // - Else default 0 for starting inventory.
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

  // --- Validation ---
  if (!upc) {
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
    await appendPurchaseRow({
      timestamp: nowIso,
      entered_by: enteredBy,
      upc,
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

    await upsertCatalogRow({
      upc,
      product_name: productName,
      brand: brand || "",
      size_unit: sizeUnit || "",
      google_category_id: googleCategoryId || "",
      google_category_name: googleCategoryName || "",
      default_location: assignedLocation,
      preferred_vendor: storeVendor,
      notes: notes || "",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Save failed" },
      { status: 500 },
    );
  }
}
