// app/api/upc-lookup/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // force Node runtime (more predictable in dev)

function normalizeBarcode(input: string) {
  return (input || "").replace(/\D/g, ""); // digits only
}

function preview(text: string, max = 400) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/**
 * /api/upc-lookup?upc=012345678905
 * Calls EAN-Search barcode lookup and returns a normalized response to the UI.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("upc") || "";
    const barcode = normalizeBarcode(raw);

    if (!barcode) {
      return NextResponse.json(
        { ok: false, upc: "", error: "Missing UPC/EAN" },
        { status: 400 }
      );
    }

    const base =
      process.env.UPC_API_BASE_URL || "https://api.ean-search.org/api";
    const token = process.env.UPC_API_KEY;

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          upc: barcode,
          error: "UPC API not configured (missing UPC_API_KEY)",
        },
        { status: 500 }
      );
    }

    // const url =
    //   `${base}` +
    //   `?token=${encodeURIComponent(token)}` +
    //   `&op=barcode-lookup` +
    //   `&barcode=${encodeURIComponent(barcode)}` +
    //   `&format=json`;

    const isUpc = barcode.length === 12;
    const isEan = barcode.length === 13 || barcode.length === 14;

    if (!isUpc && !isEan) {
      return NextResponse.json(
        {
          ok: false,
          upc: barcode,
          error: `Unsupported barcode length (${barcode.length})`,
        },
        { status: 400 }
      );
    }

    const url =
      `${base}` +
      `?token=${encodeURIComponent(token)}` +
      `&op=barcode-lookup` +
      `&format=json` +
      (isUpc
        ? `&upc=${encodeURIComponent(barcode)}`
        : `&ean=${encodeURIComponent(barcode)}`);

    const r = await fetch(url, { cache: "no-store" });

    // Always read as text first — upstream sometimes returns HTML even with 200.
    const rawText = await r.text();
    const contentType = r.headers.get("content-type") || "";

    if (!r.ok) {
      return NextResponse.json(
        {
          ok: false,
          upc: barcode,
          error: `UPC API error (${r.status})`,
          status: r.status,
          contentType,
          upstreamPreview: preview(rawText),
          url,
        },
        { status: 502 }
      );
    }

    // Parse JSON safely
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          upc: barcode,
          error: "UPC provider returned non-JSON",
          contentType,
          upstreamPreview: preview(rawText),
          url,
        },
        { status: 502 }
      );
    }

    // EAN-Search typically returns product under `product` or an array under `products`
    const product = Array.isArray(data)
      ? data[0]
      : data?.product ?? data?.products?.[0] ?? data;

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

    const ean =
      (product?.ean || product?.barcode || "").toString().trim() || undefined;

    // return NextResponse.json({
    //   ok: true,
    //   upc: barcode,
    //   ean,
    //   name,
    //   brand,
    //   sizeUnit,
    //   imageUrl,
    //   googleCategoryId,
    //   googleCategoryName,
    //   issuingCountry,
    //   // raw: data, // uncomment temporarily if needed
    // });
    return NextResponse.json({
      ok: true,
      upc: barcode,
      ean,
      name,
      brand,
      sizeUnit,
      imageUrl,
      googleCategoryId,
      googleCategoryName,
      issuingCountry,
      raw: data, // ✅ TEMP: inspect provider response
    });
  } catch (e: any) {
    // Last line of defense: ALWAYS JSON
    return NextResponse.json(
      {
        ok: false,
        upc: "",
        error: e?.message || "Lookup failed (server error)",
      },
      { status: 500 }
    );
  }
}
