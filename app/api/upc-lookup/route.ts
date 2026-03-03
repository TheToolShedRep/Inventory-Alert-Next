// app/api/upc-lookup/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCatalogDefaultsByUpc } from "@/lib/purchases";

export const runtime = "nodejs"; // keep Node runtime

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

function isUpcLookupEnabled() {
  return String(process.env.ENABLE_UPC_LOOKUP || "").toLowerCase() === "true";
}

function normalizeBarcode(input: string) {
  return (input || "").replace(/\D/g, ""); // digits only
}

function preview(text: string, max = 400) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/**
 * Simple in-memory cache to reduce repeat UPC calls.
 * Note: resets on deploy/restart; that's fine.
 */
const memCache = new Map<string, { exp: number; data: any }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * /api/upc-lookup?upc=012345678905
 * - Clerk user OR internal key required (prevents token abuse)
 * - ENABLE_UPC_LOOKUP toggle allows staging/dev to run without paid lookups
 * - Catalog-first shortcut: if product is already in Catalog, return that (no API call)
 * - Memory cache: prevents duplicate paid calls during a scan session
 */
export async function GET(req: Request) {
  try {
    // ✅ Auth gate
    if (!allowInternalKey(req)) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json(
          { ok: false, upc: "", error: "Unauthorized" },
          { status: 401 },
        );
      }
    }

    // ✅ Feature toggle (lets staging/dev work without UPC token)
    if (!isUpcLookupEnabled()) {
      return NextResponse.json(
        {
          ok: false,
          upc: "",
          error: "UPC lookup disabled (ENABLE_UPC_LOOKUP=false)",
        },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("upc") || "";
    const barcode = normalizeBarcode(raw);

    if (!barcode) {
      return NextResponse.json(
        { ok: false, upc: "", error: "Missing UPC/EAN" },
        { status: 400 },
      );
    }

    const isUpc = barcode.length === 12;
    const isEan = barcode.length === 13 || barcode.length === 14;

    if (!isUpc && !isEan) {
      return NextResponse.json(
        {
          ok: false,
          upc: barcode,
          error: `Unsupported barcode length (${barcode.length})`,
        },
        { status: 400 },
      );
    }

    // ✅ 1) Catalog-first shortcut (free)
    // If already known in Catalog, return immediately.
    try {
      const cachedCatalog = await getCatalogDefaultsByUpc(barcode);
      if (cachedCatalog?.productName) {
        return NextResponse.json({
          ok: true,
          upc: barcode,
          ean: undefined,
          name: cachedCatalog.productName,
          brand: undefined,
          sizeUnit: undefined,
          imageUrl: undefined,
          googleCategoryId: undefined,
          googleCategoryName: undefined,
          issuingCountry: undefined,
          source: "catalog",
        });
      }
    } catch {
      // If Catalog lookup fails, don't block paid lookup.
    }

    // ✅ 2) Memory cache (free)
    const hit = memCache.get(barcode);
    if (hit && hit.exp > Date.now()) {
      return NextResponse.json({ ...hit.data, source: "memory_cache" });
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
        { status: 500 },
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
        },
        { status: 502 },
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
        },
        { status: 502 },
      );
    }

    // EAN-Search typically returns product under `product` or an array under `products`
    const product = Array.isArray(data)
      ? data[0]
      : (data?.product ?? data?.products?.[0] ?? data);

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

    // ✅ Only include raw in dev OR when explicitly enabled
    const includeRaw =
      process.env.NODE_ENV !== "production" ||
      String(process.env.DEBUG_UPC_LOOKUP_RAW || "").toLowerCase() === "true";

    const responseBody: any = {
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
      source: "ean_search",
      ...(includeRaw ? { raw: data } : {}),
    };

    // ✅ cache successful lookups
    memCache.set(barcode, {
      exp: Date.now() + CACHE_TTL_MS,
      data: responseBody,
    });

    return NextResponse.json(responseBody);
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        upc: "",
        error: e?.message || "Lookup failed (server error)",
      },
      { status: 500 },
    );
  }
}
