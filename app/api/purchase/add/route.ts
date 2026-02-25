// app/api/purchase/add/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { appendRowsHeaderDriven } from "@/lib/sheets/sheets-utils";

export const runtime = "nodejs";

/**
 * Auth gate: Clerk session (browser) OR internal key (curl/jobs)
 * - Internal key header: x-api-key: $INTERNAL_API_KEY
 */
function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

function norm(v: any) {
  return String(v ?? "").trim();
}
function up(v: any) {
  return norm(v).toUpperCase();
}

// Robust numeric parse for sheet values ("16", " $16 ", "16.0")
function toNumber(v: any) {
  const s = norm(v);
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "POST JSON: { upc, qty_purchased, product_name?, brand?, size_unit?, google_category?, google_category_name?, total_price?, unit_price?, store_vendor?, assigned_location?, note? }",
    note: "Header-driven append: only columns that exist in Purchases will be written.",
  });
}

export async function POST(req: Request) {
  // Auth: internal key OR Clerk session
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

  // REQUIRED
  const upc = up(body?.upc);
  const qtyPurchased = toNumber(body?.qty_purchased);

  if (!upc) {
    return NextResponse.json(
      { ok: false, error: "Missing upc" },
      { status: 400 },
    );
  }
  if (!(qtyPurchased > 0)) {
    return NextResponse.json(
      { ok: false, error: "qty_purchased must be > 0" },
      { status: 400 },
    );
  }

  // OPTIONAL (aligned to your Purchases headers list)
  const productName = norm(body?.product_name);
  const brand = norm(body?.brand);
  const sizeUnit = norm(body?.size_unit);

  const googleCategory = norm(body?.google_category);
  const googleCategoryName = norm(body?.google_category_name);

  const totalPrice = toNumber(body?.total_price);
  const unitPriceFromBody = toNumber(body?.unit_price);

  // If they passed unit_price, trust it; else compute if total_price provided.
  const unitPrice =
    unitPriceFromBody > 0
      ? unitPriceFromBody
      : totalPrice > 0
        ? Number((totalPrice / qtyPurchased).toFixed(4))
        : 0;

  const storeVendor = norm(body?.store_vendor);
  const assignedLocation = norm(body?.assigned_location);
  const note = norm(body?.note);

  // Append-only ledger row object (header-driven)
  const rowObj: Record<string, any> = {
    timestamp: new Date().toISOString(),
    entered_by: enteredBy,
    upc,
    product_name: productName,
    brand,
    size_unit: sizeUnit,
    google_category: googleCategory,
    google_category_name: googleCategoryName,
    qty_purchased: qtyPurchased,
    total_price: totalPrice > 0 ? totalPrice : "",
    unit_price: unitPrice > 0 ? unitPrice : "",
    store_vendor: storeVendor,
    assigned_location: assignedLocation,
    note,
  };

  const writeRes = await appendRowsHeaderDriven({
    tabName: "Purchases",
    rowObjects: [rowObj],
  });

  return NextResponse.json({
    ok: true,
    scope: "purchase-add",
    upc,
    qty_purchased: qtyPurchased,
    entered_by: enteredBy,
    rows_written: writeRes.rows_written,
  });
}
