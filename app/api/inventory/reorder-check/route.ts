// app/api/inventory/reorder-check/route.ts

import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";
import { overwriteTabValues } from "@/lib/sheets/overwriteTab";
import { requireInternalKey } from "@/lib/auth/internal";

/**
 * DAY 3 GOAL:
 * - Deterministic reorder-check
 * - Reads inventory signals (purchases, usage, adjustments)
 * - Writes ONLY to Shopping_List
 * - Does NOT touch Shopping_Manual
 * - Avoid duplicates / header issues
 * - Fail loudly if inventory math is missing
 */

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

export async function GET(req: Request) {
  const deny = requireInternalKey(req);
  if (deny) return deny;

  const started = Date.now();
  const nowIso = new Date().toISOString();

  // ✅ CHANGE (DEBUG): Echo which spreadsheet env value is being used at runtime.
  // This helps prove env mismatch across "read" vs "write" paths.
  // If this ID differs from /api/shopping-list debug_sheet_id, that’s the bug.
  const debug_sheet_id = process.env.GOOGLE_SHEET_ID || "";

  try {
    /**
     * ✅ CHANGE: include Inventory_Adjustments and destructure it correctly
     */
    const [catalog, purchases, usage, adjustments] = await Promise.all([
      readTabAsObjects("Catalog"),
      readTabAsObjects("Purchases"),
      readTabAsObjects("Inventory_Usage"),
      readTabAsObjects("Inventory_Adjustments").catch(() => ({
        rows: [],
        ok: true,
      })),
    ]);

    /**
     * ✅ DAY 3 SAFETY:
     * If inventory math hasn't been run / usage is empty, fail loudly.
     * This prevents reorder-check from silently lying based only on purchases.
     */
    if (!usage.rows || usage.rows.length === 0) {
      throw new Error(
        "Inventory_Usage is empty. Run /api/inventory-math/run?date=YYYY-MM-DD first (mode=replace recommended).",
      );
    }

    /**
     * Purchases: sum base units added (lifetime)
     * - Prefer base_units_added if present
     * - Else fallback to qty_purchased
     */
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

    /**
     * Usage: sum theoretical used qty (lifetime)
     */
    const usedByUpc: Record<string, number> = {};
    for (const r of usage.rows) {
      const upc = norm(r["ingredient_upc"]);
      if (!upc) continue;

      const used = toNumber(r["theoretical_used_qty"]);
      if (used !== 0) usedByUpc[upc] = (usedByUpc[upc] || 0) + used;
    }

    /**
     * ✅ CHANGE: Adjustments: sum base_units_delta (lifetime)
     */
    const adjByUpc: Record<string, number> = {};
    for (const r of adjustments.rows || []) {
      const upc = norm(r["upc"]);
      if (!upc) continue;

      const delta = toNumber(r["base_units_delta"]);
      if (delta !== 0) adjByUpc[upc] = (adjByUpc[upc] || 0) + delta;
    }

    /**
     * Build Shopping_List rows from Catalog
     */
    const rows: any[][] = [];
    const seen = new Set<string>(); // ✅ safety vs duplicate UPC rows in Catalog

    for (const r of catalog.rows) {
      const upc = norm(r["upc"]);
      if (!upc) continue;

      // ✅ prevent duplicates if Catalog has duplicate UPCs
      if (seen.has(upc)) continue;
      seen.add(upc);

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
      const adj = adjByUpc[upc] || 0;

      /**
       * ✅ CHANGE: onHand includes adjustments
       */
      const onHand = purchased - used + adj;

      // Only flag items at/below reorder point
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

    /**
     * ✅ Day 3 requirement: writes ONLY to Shopping_List
     * Does not touch Shopping_Manual.
     */
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

      // ✅ CHANGE (DEBUG): return which sheet ID env was used.
      debug_sheet_id,

      // ✅ Optional extra debug (helps confirm the tab reads are non-empty)
      debug_counts: {
        catalog: catalog?.rows?.length ?? 0,
        purchases: purchases?.rows?.length ?? 0,
        usage: usage?.rows?.length ?? 0,
        adjustments: (adjustments as any)?.rows?.length ?? 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "reorder-check",
        error: e?.message || "Server error",

        // ✅ CHANGE (DEBUG): still echo sheet id even on error
        debug_sheet_id,
      },
      { status: 500 },
    );
  }
}
