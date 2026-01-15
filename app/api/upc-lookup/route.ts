// app/api/upc-lookup/route.ts
import { NextResponse } from "next/server";

function normalizeBarcode(input: string) {
  return (input || "").replace(/\D/g, ""); // digits only
}

/**
 * /api/upc-lookup?upc=012345678905
 * Calls EAN-Search barcode lookup and returns a normalized response to the UI.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("upc") || "";
  const barcode = normalizeBarcode(raw);

  if (!barcode) {
    return NextResponse.json(
      { ok: false, upc: "", error: "Missing UPC/EAN" },
      { status: 400 }
    );
  }

  const base = process.env.UPC_API_BASE_URL || "https://api.ean-search.org/api";
  const token = process.env.UPC_API_KEY;

  if (!token) {
    return NextResponse.json(
      { ok: false, upc: barcode, error: "UPC API not configured" },
      { status: 500 }
    );
  }

  try {
    const url =
      `${base}` +
      `?token=${encodeURIComponent(token)}` +
      `&op=barcode-lookup` +
      `&barcode=${encodeURIComponent(barcode)}` +
      `&format=json`;

    const r = await fetch(url, { cache: "no-store" });

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, upc: barcode, error: `UPC API error (${r.status})` },
        { status: 502 }
      );
    }

    const data = await r.json();

    // EAN-Search typically returns product under `product` or an array under `products`
    const product = data?.product ?? data?.products?.[0] ?? data;

    // Normalize fields (defensive)
    const name =
      (product?.name || product?.title || "").toString().trim() ||
      "Unknown Item";

    const brand =
      (product?.brand || product?.manufacturer || "").toString().trim() ||
      undefined;

    const sizeUnit =
      (product?.size || product?.sizeUnit || product?.quantity || "")
        .toString()
        .trim() || undefined;

    const googleCategoryId =
      product?.googleCategoryId != null
        ? String(product.googleCategoryId)
        : undefined;

    const googleCategoryName =
      (product?.categoryName || product?.googleCategoryName || "")
        .toString()
        .trim() || undefined;

    const issuingCountry =
      (product?.issuingCountry || "").toString().trim() || undefined;

    const imageUrl =
      (product?.image || product?.imageUrl || product?.img || "")
        .toString()
        .trim() || undefined;

    // EAN-Search may return "ean" or "barcode" in response
    const ean =
      (product?.ean || product?.barcode || "").toString().trim() || undefined;

    return NextResponse.json({
      ok: true,
      upc: barcode, // what you scanned (digits)
      ean, // provider's GTIN/EAN if present
      name,
      brand,
      sizeUnit,
      imageUrl,
      googleCategoryId,
      googleCategoryName,
      issuingCountry,
      // raw: data, // uncomment temporarily if mapping needs debugging
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, upc: barcode, error: e?.message || "Lookup failed" },
      { status: 500 }
    );
  }
}
