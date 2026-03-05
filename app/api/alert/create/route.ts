// app/api/alert/create/route.ts
import { NextResponse } from "next/server";
import { createAlert } from "@/lib/sheets-core";
import { resolveToIngredientUpc } from "@/lib/barcodes/resolve";

export const runtime = "nodejs";

/**
 * This route may receive:
 * - ingredient_upc (stable internal key) e.g. "EGG", "PORK_BACON_SLICE"
 * - barcode_upc (scanned digits)        e.g. "012345678901"
 *
 * ✅ Rule:
 * - Always store ingredient_upc in the Alerts ledger (never barcode values).
 */
function norm(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Accept either "upc" or "code"
    const code = norm(body?.upc ?? body?.code);

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "Missing body.upc" },
        { status: 400 },
      );
    }

    // Resolve to ingredient_upc safely
    const resolved = await resolveToIngredientUpc(code);

    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, error: resolved.error || "Resolve failed" },
        { status: 500 },
      );
    }

    if (!resolved.found) {
      // Safety: if it looks like a barcode, don't allow creating an alert with raw barcode as UPC.
      if (resolved.probably_barcode) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Unknown barcode. Add a mapping in Barcode_Map (or Catalog fallback) before creating an alert.",
            code,
          },
          { status: 400 },
        );
      }

      // If it doesn't look like a barcode, treat it as a pseudo ingredient_upc (legacy behavior).
    }

    const ingredient_upc = resolved.found ? resolved.ingredient_upc : code;

    // ✅ Force canonical key into the payload that sheets-core will store
    const patchedBody = {
      ...body,
      upc: ingredient_upc,
      ingredient_upc, // optional extra field for debugging/future-proofing
      barcode_upc: resolved.found ? resolved.barcode_upc || "" : "",
      resolve_source: resolved.found ? resolved.source : "direct",
    };

    const alertId = await createAlert(patchedBody);

    return NextResponse.json({
      ok: true,
      alertId,
      ingredient_upc,
      resolved: resolved.found
        ? { source: resolved.source }
        : { source: "direct" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Create failed" },
      { status: 500 },
    );
  }
}
