// app/api/inventory/stock/route.ts
import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";

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

export async function GET() {
  const started = Date.now();

  try {
    const [catalog, purchases, usage] = await Promise.all([
      readTabAsObjects("Catalog"),
      readTabAsObjects("Purchases"),
      readTabAsObjects("Inventory_Usage"),
    ]);

    // ----------------------------
    // 1) Sum purchases by UPC
    // ----------------------------
    const purchasedByUpc = new Map<string, number>();

    for (const r of purchases.rows) {
      const upc = norm(r["upc"]);
      if (!upc) continue;

      const added = toNumber(r["base_units_added"]);

      purchasedByUpc.set(upc, (purchasedByUpc.get(upc) || 0) + added);
    }

    // ----------------------------
    // 2) Sum usage by UPC
    // ----------------------------
    const usedByUpc = new Map<string, number>();

    for (const r of usage.rows) {
      const upc = norm(r["ingredient_upc"]);
      if (!upc) continue;

      const used = toNumber(r["theoretical_used_qty"]);

      usedByUpc.set(upc, (usedByUpc.get(upc) || 0) + used);
    }

    // ----------------------------
    // 3) Build inventory rows
    // ----------------------------
    const rows = catalog.rows.map((r) => {
      const upc = norm(r["upc"]);

      const purchased = purchasedByUpc.get(upc) || 0;
      const used = usedByUpc.get(upc) || 0;

      const current_stock = purchased - used;

      const reorder_point = toNumber(r["par_level"]);

      let status = "ok";

      if (!reorder_point) status = "unknown";
      else if (current_stock <= reorder_point) status = "low";

      return {
        upc,
        product_name: norm(r["product_name"]),
        location: norm(r["default_location"]),
        unit: norm(r["size_unit"]),
        vendor: norm(r["preferred_vendor"]),

        current_stock,
        reorder_point,

        total_purchased: purchased,
        total_used: used,

        status,
      };
    });

    const low_count = rows.filter((r) => r.status === "low").length;
    const unknown_count = rows.filter((r) => r.status === "unknown").length;

    return NextResponse.json({
      ok: true,
      scope: "inventory-stock",
      ms: Date.now() - started,
      count: rows.length,
      low_count,
      unknown_count,
      rows,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "inventory-stock",
        error: err?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
