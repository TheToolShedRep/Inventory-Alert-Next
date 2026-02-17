import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";
import { overwriteTabValues } from "@/lib/sheets/overwriteTab";

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

function truthy(v: any) {
  const s = norm(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

export async function GET() {
  const started = Date.now();
  const nowIso = new Date().toISOString();

  try {
    const [catalog, purchases, usage] = await Promise.all([
      readTabAsObjects("Catalog"),
      readTabAsObjects("Purchases"),
      readTabAsObjects("Inventory_Usage"),
    ]);

    // Build quick lookup for Purchases sums per UPC
    const purchasedByUpc: Record<string, number> = {};
    for (const r of purchases.rows) {
      const upc = norm(r["upc"]);
      if (!upc) continue;

      const baseAdded = toNumber(r["base_units_added"]);
      const qtyPurchased = toNumber(r["qty_purchased"]);
      const add =
        baseAdded > 0 ? baseAdded : qtyPurchased > 0 ? qtyPurchased : 0;

      if (add > 0) purchasedByUpc[upc] = (purchasedByUpc[upc] || 0) + add;
    }

    // Build quick lookup for Usage sums per UPC (lifetime)
    const usedByUpc: Record<string, number> = {};
    for (const r of usage.rows) {
      const upc = norm(r["ingredient_upc"]);
      if (!upc) continue;

      const used = toNumber(r["theoretical_used_qty"]);
      if (used > 0) usedByUpc[upc] = (usedByUpc[upc] || 0) + used;
    }

    // Generate reorder rows
    const rows: any[][] = [];
    for (const r of catalog.rows) {
      const upc = norm(r["upc"]);
      if (!upc) continue;

      // active defaults to TRUE if blank
      const activeRaw = norm(r["active"]);
      const isActive = activeRaw ? truthy(activeRaw) : true;
      if (!isActive) continue;

      const reorderPoint = toNumber(r["reorder_point"]);
      if (!Number.isFinite(reorderPoint) || reorderPoint <= 0) continue;

      const parLevel = toNumber(r["par_level"]);
      const productName = norm(r["product_name"]) || upc;
      const baseUnit = norm(r["base_unit"]) || "each";
      const preferredVendor = norm(r["preferred_vendor"]);
      const defaultLocation = norm(r["default_location"]);

      const purchased = purchasedByUpc[upc] || 0;
      const used = usedByUpc[upc] || 0;
      const onHand = purchased - used;

      if (onHand > reorderPoint) continue;

      // Qty to order: prefer par - onHand if par exists, otherwise reorderPoint - onHand
      const qtyToOrder =
        parLevel > 0
          ? Math.max(0, parLevel - onHand)
          : Math.max(0, reorderPoint - onHand);

      rows.push([
        nowIso,
        upc,
        productName,
        onHand,
        baseUnit,
        reorderPoint,
        parLevel || "",
        qtyToOrder,
        preferredVendor,
        defaultLocation,
        onHand < 0
          ? "Negative on-hand (missing starting inventory or mismatch)"
          : "",
      ]);
    }

    const header = [
      "timestamp",
      "upc",
      "product_name",
      "on_hand_base_units",
      "base_unit",
      "reorder_point",
      "par_level",
      "qty_to_order_base_units",
      "preferred_vendor",
      "default_location",
      "note",
    ];

    await overwriteTabValues({
      tabName: "Shopping_List",
      header,
      rows,
    });

    return NextResponse.json({
      ok: true,
      scope: "reorder-check",
      ms: Date.now() - started,
      items_flagged: rows.length,
      written_to: "Shopping_List",
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "reorder-check",
        error: e?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
