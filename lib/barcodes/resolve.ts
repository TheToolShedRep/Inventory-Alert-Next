// lib/barcodes/resolve.ts
import { readTabAsObjects } from "@/lib/sheets/read";

function norm(v: any) {
  return String(v ?? "").trim();
}

function up(v: any) {
  return norm(v).toUpperCase();
}

/**
 * Heuristic: if it’s 11–14 digits, treat as “probably barcode”
 * UPC-A (12), EAN-13 (13), GTIN-14 (14). Some scanners drop leading 0 (11).
 */
function isProbablyBarcode(v: string) {
  const s = norm(v);
  return /^\d{11,14}$/.test(s);
}

export type BarcodeResolveResult =
  | {
      ok: true;
      found: true;
      query: string;
      ingredient_upc: string;
      source: "barcode_map" | "catalog_fallback";
      barcode_upc?: string;
    }
  | {
      ok: true;
      found: false;
      query: string;
      reason: "not_found";
      probably_barcode: boolean;
    }
  | {
      ok: false;
      error: string;
      query?: string;
    };

/**
 * Resolve a scanned barcode (or an ingredient key) to ingredient_upc.
 *
 * ✅ Priority:
 * 1) Barcode_Map (barcode_upc -> ingredient_upc)
 * 2) Catalog fallback (Catalog.barcode_upc -> Catalog.upc)
 * 3) If query itself matches Catalog.upc, that is already ingredient_upc
 *
 * ✅ Output always returns ingredient_upc when found.
 */
export async function resolveToIngredientUpc(
  queryRaw: string,
): Promise<BarcodeResolveResult> {
  try {
    const query = up(queryRaw);
    if (!query) {
      return { ok: false, error: "Missing query" };
    }

    // --- 1) Barcode_Map ---
    try {
      const bm = await readTabAsObjects("Barcode_Map");
      const match = bm.rows.find((r) => {
        const barcode = up(r["barcode_upc"]);
        const active = up(r["active"] || "true");
        return barcode === query && active !== "FALSE";
      });

      if (match) {
        const ingredient_upc = up(match["ingredient_upc"]);
        if (ingredient_upc) {
          return {
            ok: true,
            found: true,
            query,
            ingredient_upc,
            source: "barcode_map",
            barcode_upc: norm(match["barcode_upc"]) || "",
          };
        }
      }
    } catch {
      // If sheet is missing early on, we don't hard-fail—fallback to Catalog.
    }

    // --- 2) Catalog fallback ---
    const catalog = await readTabAsObjects("Catalog");

    // (a) If they passed ingredient_upc directly
    const byIngredient = catalog.rows.find((r) => up(r["upc"]) === query);
    if (byIngredient) {
      return {
        ok: true,
        found: true,
        query,
        ingredient_upc: up(byIngredient["upc"]) || query,
        source: "catalog_fallback",
        barcode_upc: norm(byIngredient["barcode_upc"]) || "",
      };
    }

    // (b) If they passed a barcode stored on Catalog row
    const byBarcode = catalog.rows.find((r) => up(r["barcode_upc"]) === query);
    if (byBarcode) {
      const ingredient_upc = up(byBarcode["upc"]);
      return {
        ok: true,
        found: true,
        query,
        ingredient_upc: ingredient_upc || query,
        source: "catalog_fallback",
        barcode_upc: norm(byBarcode["barcode_upc"]) || "",
      };
    }

    return {
      ok: true,
      found: false,
      query,
      reason: "not_found",
      probably_barcode: isProbablyBarcode(query),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "resolveToIngredientUpc failed",
    };
  }
}
