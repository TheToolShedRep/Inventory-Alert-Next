// app/api/catalog-lookup/route.ts
import { NextResponse } from "next/server";
import { getCatalogDefaultsByUpc } from "@/lib/purchases";

/**
 * We support two UPC styles:
 * 1) Real barcodes (digits)
 * 2) Pseudo-UPCs (internal keys) like "EGG", "CROISSANT", "PORK_BACON_SLICE"
 *
 * So DO NOT strip non-digits. Just trim.
 */
function normalizeUpc(input: string) {
  return (input || "").toString().trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("upc") || "";
  const upc = normalizeUpc(raw);

  if (!upc) {
    return NextResponse.json(
      { ok: false, error: "Missing upc" },
      { status: 400 },
    );
  }

  try {
    const defaults = await getCatalogDefaultsByUpc(upc);

    return NextResponse.json({
      ok: true,
      upc,
      defaults,
      // TEMP DEBUG: remove after we confirm columns
      debug: {
        sheetIdLast4: (process.env.GOOGLE_SHEET_ID || "").slice(-4),
        catalogTab: process.env.CATALOG_TAB || "Catalog",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Lookup failed" },
      { status: 500 },
    );
  }
}
