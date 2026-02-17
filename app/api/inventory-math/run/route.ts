// app/api/inventory-math/run/route.ts
import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";
import { appendRowsHeaderDriven } from "@/lib/sheets/sheets-utils";
import { overwriteTabValues } from "@/lib/sheets/overwriteTab";

type RecipeRow = {
  menu_item_clean: string;
  ingredient_upc: string;
  qty_per_item: string;
  base_unit: string;
  active: string;
  notes: string;
};

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

export async function GET(req: Request) {
  const started = Date.now();

  try {
    const url = new URL(req.url);
    const date = norm(url.searchParams.get("date"));
    const mode = norm(url.searchParams.get("mode")).toLowerCase() || "append"; // append | replace

    if (!date) {
      return NextResponse.json(
        { ok: false, error: "Missing ?date=YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // 1) Read Sales + Recipes (+ Catalog for optional UPC coverage checks)
    const sales = await readTabAsObjects("Sales_Daily");
    const recipes = await readTabAsObjects("Recipes");
    const catalog = await readTabAsObjects("Catalog");

    // Build a set of UPCs that exist in Catalog (for coverage warnings)
    const catalogUpcs = new Set(
      catalog.rows.map((r) => norm(r["upc"])).filter(Boolean),
    );

    // 2) Filter Sales_Daily rows for date + valid qty/menu
    const salesRowsForDate = sales.rows.filter((r) => {
      const d = norm(r["date"]);
      const qty = toNumber(r["qty_sold"]);
      const menu = norm(r["menu_item_clean"] || r["menu_item"]);
      return d === date && menu.length > 0 && qty > 0;
    });

    // 3) Sum qty sold by menu_item_clean
    const soldByMenu: Record<string, number> = {};
    for (const r of salesRowsForDate) {
      const menu = norm(r["menu_item_clean"] || r["menu_item"]);
      const qty = toNumber(r["qty_sold"]);
      soldByMenu[menu] = (soldByMenu[menu] || 0) + qty;
    }

    // 4) Index active recipes by menu_item_clean
    const recipeRows = recipes.rows as unknown as RecipeRow[];
    const activeRecipesByMenu: Record<string, RecipeRow[]> = {};

    for (const rr of recipeRows) {
      const activeRaw = norm(rr.active).toLowerCase();
      const isActive =
        activeRaw === "true" ||
        activeRaw === "1" ||
        activeRaw === "yes" ||
        activeRaw === "y";

      if (!isActive) continue;

      const menu = norm(rr.menu_item_clean);
      if (!menu) continue;

      if (!activeRecipesByMenu[menu]) activeRecipesByMenu[menu] = [];
      activeRecipesByMenu[menu].push(rr);
    }

    // 5) Build Inventory_Usage rows (ledger rows)
    const outRows: Record<string, any>[] = [];
    const missingRecipes: string[] = [];
    const missingCatalogUpcs = new Set<string>();

    for (const [menu, qtySold] of Object.entries(soldByMenu)) {
      const recipeList = activeRecipesByMenu[menu];

      if (!recipeList || recipeList.length === 0) {
        missingRecipes.push(menu);
        continue;
      }

      for (const rr of recipeList) {
        const upc = norm(rr.ingredient_upc);
        if (upc && !catalogUpcs.has(upc)) missingCatalogUpcs.add(upc);

        const qtyPerItem = toNumber(rr.qty_per_item);
        const qtyUsedTotal = qtySold * qtyPerItem;

        outRows.push({
          date,
          menu_item_clean: menu,
          ingredient_upc: upc,
          theoretical_used_qty: qtyUsedTotal,
        });
      }
    }

    // If nothing to write, still return debug info
    if (outRows.length === 0) {
      return NextResponse.json({
        ok: true,
        scope: "inventory-math",
        date,
        mode,
        ms: Date.now() - started,
        sales_rows_used: salesRowsForDate.length,
        menu_items_count: Object.keys(soldByMenu).length,
        rows_written: 0,
        missing_recipes: missingRecipes,
        missing_catalog_upcs: Array.from(missingCatalogUpcs),
        active_recipe_total_menus: Object.keys(activeRecipesByMenu).length,
        active_recipe_menu_keys_sample: Object.keys(activeRecipesByMenu).slice(
          0,
          20,
        ),
        note: "No rows written (no matching active recipes).",
      });
    }

    // 6) Replace logic: remove existing Inventory_Usage rows for this date first
    if (mode === "replace") {
      const ledger = await readTabAsObjects("Inventory_Usage");

      // Prefer header from read util if provided, else use known ledger header
      const header: string[] =
        // @ts-ignore - if your read util provides header, use it
        (ledger.header as string[] | undefined) ?? [
          "date",
          "menu_item_clean",
          "ingredient_upc",
          "theoretical_used_qty",
        ];

      const keptObjects = ledger.rows.filter((r) => norm(r["date"]) !== date);

      const kept2d = keptObjects.map((obj) => header.map((h) => obj[h] ?? ""));

      await overwriteTabValues({
        tabName: "Inventory_Usage",
        header,
        rows: kept2d,
      });
    }

    // 7) Append the new rows
    const writeRes = await appendRowsHeaderDriven({
      tabName: "Inventory_Usage",
      rowObjects: outRows,
    });

    return NextResponse.json({
      ok: true,
      scope: "inventory-math",
      date,
      mode,
      ms: Date.now() - started,
      sales_rows_used: salesRowsForDate.length,
      menu_items_count: Object.keys(soldByMenu).length,
      rows_written: writeRes.rows_written,
      missing_recipes: missingRecipes,
      missing_catalog_upcs: Array.from(missingCatalogUpcs),

      // DEBUG (temporary)
      active_recipe_total_menus: Object.keys(activeRecipesByMenu).length,
      active_recipe_menu_keys_sample: Object.keys(activeRecipesByMenu).slice(
        0,
        20,
      ),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "inventory-math",
        error: err?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
