// app/api/purchase/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { appendPurchaseRow, upsertCatalogRow } from "@/lib/purchases";

function digitsOnly(input: string) {
  return (input || "").replace(/\D/g, "");
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await currentUser();
  const enteredBy =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const upc = digitsOnly(body.upc);
  const productName = (body.productName || "").toString().trim();

  const qtyPurchased = Number(body.qtyPurchased ?? 0);

  // The UI is currently sending "price" as a unit price.
  // We'll store it as unitPrice and compute totalPrice.
  const unitPrice = Number(body.totalPrice); // (rename later if you want)
  const totalPrice = qtyPurchased * unitPrice;

  const storeVendor = (body.storeVendor || "").toString().trim();
  const assignedLocation = (body.assignedLocation || "").toString().trim();

  const brand = (body.brand || "").toString().trim();
  const sizeUnit = (body.sizeUnit || "").toString().trim();
  const googleCategoryId = (body.googleCategoryId || "").toString().trim();
  const googleCategoryName = (body.googleCategoryName || "").toString().trim();
  const notes = (body.notes || "").toString().trim();

  // --- Validation ---
  if (!upc) {
    return NextResponse.json(
      { ok: false, error: "Missing upc" },
      { status: 400 }
    );
  }
  if (!productName) {
    return NextResponse.json(
      { ok: false, error: "Missing productName" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json(
      { ok: false, error: "unitPrice must be a number >= 0" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(totalPrice) || totalPrice < 0) {
    return NextResponse.json(
      { ok: false, error: "totalPrice must be a number >= 0" },
      { status: 400 }
    );
  }
  if (!storeVendor) {
    return NextResponse.json(
      { ok: false, error: "Missing storeVendor" },
      { status: 400 }
    );
  }
  if (assignedLocation !== "Kitchen" && assignedLocation !== "Front") {
    return NextResponse.json(
      { ok: false, error: "assignedLocation must be 'Kitchen' or 'Front'" },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();

  try {
    // 1) Append purchase event (OBJECT SHAPE expected by lib/purchases.ts)
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

    // 2) Upsert Catalog “memory”
    await upsertCatalogRow({
      upc,
      product_name: productName,
      brand: brand || "",
      size_unit: sizeUnit || "",
      google_category_id: googleCategoryId || "",
      google_category_name: googleCategoryName || "",
      default_location: assignedLocation,
      preferred_vendor: storeVendor,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Save failed" },
      { status: 500 }
    );
  }
}
