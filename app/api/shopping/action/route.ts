// app/api/shopping/action/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  appendInventoryAdjustment, // ✅ ADDED
  appendPurchase,
  appendShoppingAction,
  clearShoppingActionsCache,
  ensureCatalogItem,
  getBusinessDateNY,
} from "@/lib/sheets-core";
import { readTabAsObjects } from "@/lib/sheets/read"; // ✅ ADDED
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

function toNumber(v: any) {
  const s = norm(v);
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const ALLOWED_ACTIONS = new Set(["purchased", "dismissed", "snoozed", "undo"]);

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "POST JSON: { upc, action: 'purchased'|'dismissed'|'snoozed'|'undo', note?, product_name?, mode?, quantity? }",
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

  let note = norm(body?.note);

  // ✅ Existing snooze note capture
  const snoozeChoice = norm(body?.snooze_choice);
  if (action === "snoozed" && snoozeChoice) {
    note = `snooze:${snoozeChoice}`;
  }

  const product_name = norm(body?.product_name);
  const vendor = norm(body?.vendor);
  const location = norm(body?.location);

  // ✅ ADDED: purchase mode + quantity
  const mode = norm(body?.mode).toLowerCase() || "add"; // add | set
  const quantityRaw = norm(body?.quantity);
  const quantity = toNumber(quantityRaw);

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

  // ✅ Validate purchase mode only when purchased
  if (action === "purchased") {
    if (mode !== "add" && mode !== "set") {
      return NextResponse.json(
        { ok: false, error: "mode must be 'add' or 'set'" },
        { status: 400 },
      );
    }

    if (!quantityRaw || !Number.isFinite(quantity)) {
      return NextResponse.json(
        { ok: false, error: "quantity is required for purchased actions" },
        { status: 400 },
      );
    }
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
    mode, // ✅ ADDED
    quantity, // ✅ ADDED
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

  // ✅ Purchased flow now supports two behaviors:
  // - mode === "add" → appendPurchase
  // - mode === "set" → appendInventoryAdjustment(delta)
  if (action === "purchased") {
    await ensureCatalogItem({
      upc: ingredient_upc,
      product_name: product_name || ingredient_upc,
    });

    if (mode === "add") {
      await appendPurchase({
        entered_by: actor,
        upc: ingredient_upc,
        product_name: product_name || ingredient_upc,
        qty_purchased: quantity,
        store_vendor: vendor,
        assigned_location: location,
        notes: note,
        base_units_added: quantity,
      });

      return NextResponse.json({
        ok: true,
        ingredient_upc,
        mode,
        quantity,
        resolved: resolved.found
          ? { source: resolved.source }
          : { source: "direct" },
      });
    }

    if (mode === "set") {
      // ✅ ADDED: compute current on-hand from ledgers
      const [purchases, usage, adjustments] = await Promise.all([
        readTabAsObjects("Purchases"),
        readTabAsObjects("Inventory_Usage"),
        readTabAsObjects("Inventory_Adjustments").catch(() => ({
          rows: [],
          ok: true,
        })),
      ]);

      let purchasedBaseUnits = 0;
      for (const r of purchases.rows) {
        const rowUpc = norm(r["upc"]);
        if (rowUpc !== ingredient_upc) continue;

        const baseAdded = toNumber(r["base_units_added"]);
        const qtyPurchased = toNumber(r["qty_purchased"]);

        if (baseAdded > 0) {
          purchasedBaseUnits += baseAdded;
        } else if (qtyPurchased > 0) {
          purchasedBaseUnits += qtyPurchased;
        }
      }

      let usedBaseUnits = 0;
      for (const r of usage.rows) {
        const rowUpc = norm(r["ingredient_upc"]);
        if (rowUpc !== ingredient_upc) continue;

        usedBaseUnits += toNumber(r["theoretical_used_qty"]);
      }

      let adjustmentDelta = 0;
      for (const r of (adjustments as any).rows || []) {
        const rowUpc = norm(r["upc"]);
        if (rowUpc !== ingredient_upc) continue;

        adjustmentDelta += toNumber(r["base_units_delta"]);
      }

      const currentOnHand =
        purchasedBaseUnits - usedBaseUnits + adjustmentDelta;

      // User-entered quantity in "set" mode means desired current inventory
      const delta = quantity - currentOnHand;

      // Only write an adjustment if something actually changed
      if (delta !== 0) {
        await appendInventoryAdjustment({
          date,
          upc: ingredient_upc,
          adjustment_type: "manual_set",
          base_units_delta: delta,
          reason: note || "inventory_count",
          actor,
        });
      }

      return NextResponse.json({
        ok: true,
        ingredient_upc,
        mode,
        set_to_quantity: quantity,
        current_on_hand_before: currentOnHand,
        adjustment_delta: delta,
        resolved: resolved.found
          ? { source: resolved.source }
          : { source: "direct" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ingredient_upc,
    resolved: resolved.found
      ? { source: resolved.source }
      : { source: "direct" },
  });
}
