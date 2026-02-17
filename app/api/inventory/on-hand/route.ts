// app/api/inventory/on-hand/route.ts
import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";

/**
 * Inventory On-hand (MVP)
 * -----------------------
 * Computes on-hand for a single ingredient UPC:
 *   on_hand = purchased_base_units - used_base_units
 *
 * Sources:
 * - Purchases: adds inventory (prefer base_units_added; fallback qty_purchased)
 * - Inventory_Usage: subtracts inventory via theoretical_used_qty (append-only ledger)
 * - Catalog: used only to return base_unit (nice to have)
 *
 * Optional debug filter:
 * - ?date=YYYY-MM-DD  -> sums usage only for that date (purchases remain lifetime)
 *   Example:
 *     /api/inventory/on-hand?upc=EGG&date=2026-02-06
 */

function norm(v: any) {
  return String(v ?? "").trim();
}

// Robust numeric parse for sheet values (handles "16", " 16 ", "$16", "16.0", "16,000")
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
    const upc = norm(url.searchParams.get("upc"));
    const date = norm(url.searchParams.get("date")); // optional YYYY-MM-DD

    if (!upc) {
      return NextResponse.json(
        { ok: false, error: "Missing ?upc=EGG" },
        { status: 400 },
      );
    }

    // Read tabs
    const purchases = await readTabAsObjects("Purchases");
    const usage = await readTabAsObjects("Inventory_Usage");
    const catalog = await readTabAsObjects("Catalog");

    // --- Purchases: sum base units added (lifetime) ---
    // Prefer base_units_added if present (> 0); fallback to qty_purchased.
    let purchasedBaseUnits = 0;

    for (const r of purchases.rows) {
      const rowUpc = norm(r["upc"]);
      if (rowUpc !== upc) continue;

      const baseAdded = toNumber(r["base_units_added"]);
      const qtyPurchased = toNumber(r["qty_purchased"]);

      if (baseAdded > 0) {
        purchasedBaseUnits += baseAdded;
      } else if (qtyPurchased > 0) {
        purchasedBaseUnits += qtyPurchased;
      }
    }

    // --- Inventory_Usage: sum usage (optionally filtered by date) ---
    let usedBaseUnits = 0;

    for (const r of usage.rows) {
      const rowUpc = norm(r["ingredient_upc"]);
      if (rowUpc !== upc) continue;

      // Optional filter (debug / future daily views)
      if (date) {
        const rowDate = norm(r["date"]);
        if (rowDate !== date) continue;
      }

      const used = toNumber(r["theoretical_used_qty"]);
      usedBaseUnits += used;
    }

    // --- Catalog: base_unit (optional) ---
    let baseUnit = "each";
    for (const r of catalog.rows) {
      const rowUpc = norm(r["upc"]);
      if (rowUpc !== upc) continue;

      const bu = norm(r["base_unit"]);
      if (bu) baseUnit = bu;
      break;
    }

    const onHand = purchasedBaseUnits - usedBaseUnits;

    return NextResponse.json({
      ok: true,
      scope: "inventory-on-hand",
      upc,
      base_unit: baseUnit, // always a string
      purchased_base_units: purchasedBaseUnits,
      used_base_units: usedBaseUnits,
      on_hand_base_units: onHand,
      ...(date ? { date } : {}),
      ms: Date.now() - started,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "inventory-on-hand",
        error: err?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
