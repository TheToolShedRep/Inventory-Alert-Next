// app/api/shopping/action/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  appendPurchase,
  appendShoppingAction,
  clearShoppingActionsCache,
  ensureCatalogItem,
  getBusinessDateNY,
} from "@/lib/sheets-core";
import { resolveToIngredientUpc } from "@/lib/barcodes/resolve";

export const runtime = "nodejs";

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

function norm(v: any) {
  return String(v ?? "").trim();
}

const ALLOWED_ACTIONS = new Set(["purchased", "dismissed", "snoozed", "undo"]);

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "POST JSON: { upc, action: 'purchased'|'dismissed'|'snoozed'|'undo', note?, product_name? }",
  });
}

export async function POST(req: Request) {
  // Auth gate: internal key OR Clerk user
  let actor = "internal";
  if (!allowInternalKey(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const user = await currentUser();
    actor =
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

  const code = norm(body?.upc ?? body?.code);
  const action = String(body?.action ?? "")
    .trim()
    .toLowerCase();
  const note = norm(body?.note);
  const product_name = norm(body?.product_name);
  const vendor = norm(body?.vendor);
  const location = norm(body?.location);
  const date = getBusinessDateNY();

  // 🔒 Validate date format (YYYY-MM-DD only)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Missing upc" },
      { status: 400 },
    );
  }

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      {
        ok: false,
        error: "action must be 'purchased', 'dismissed', 'snoozed', or 'undo'",
      },
      { status: 400 },
    );
  }

  // ✅ Resolve to ingredient_upc (barcode -> ingredient)
  const resolved = await resolveToIngredientUpc(code);

  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error || "Resolve failed" },
      { status: 500 },
    );
  }

  if (!resolved.found) {
    // Safety: barcodes must be mapped; pseudo ingredient keys can pass through.
    if (resolved.probably_barcode) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unknown barcode. Add a mapping in Barcode_Map (or Catalog fallback) before taking a shopping action.",
          code,
        },
        { status: 400 },
      );
    }
  }

  const ingredient_upc = resolved.found ? resolved.ingredient_upc : code;

  console.log("✅ shopping action", {
    date,
    upc: ingredient_upc,
    action,
    actor,
    note,
    resolve_source: resolved.found ? resolved.source : "direct",
  });

  // ✅ Always write ingredient_upc into Shopping_Actions
  await appendShoppingAction({
    date,
    upc: ingredient_upc,
    action: action as "purchased" | "dismissed" | "snoozed" | "undo",
    note,
    actor,
  });

  clearShoppingActionsCache();

  // If purchased: ensure Catalog item exists and write to Purchases ledger
  if (action === "purchased") {
    await ensureCatalogItem({
      upc: ingredient_upc,
      product_name: product_name || ingredient_upc,
    });

    await appendPurchase({
      entered_by: actor,
      upc: ingredient_upc,
      product_name: product_name || ingredient_upc,
      qty_purchased: body?.quantity ?? "",
      store_vendor: vendor,
      assigned_location: location,
      notes: note,
      base_units_added: body?.quantity ?? "",
    });
  }

  return NextResponse.json({
    ok: true,
    ingredient_upc,
    resolved: resolved.found
      ? { source: resolved.source }
      : { source: "direct" },
  });
}
