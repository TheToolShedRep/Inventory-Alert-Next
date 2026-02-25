// app/api/catalog/item/route.ts
import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";
import { requireInternalKey } from "@/lib/auth/internal";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "").trim();
}

function up(v: any) {
  return norm(v).toUpperCase();
}

function toNumber(v: any) {
  const s = norm(v);
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

export async function GET(req: Request) {
  const { userId } = await auth();

  if (!userId && !allowInternalKey(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const url = new URL(req.url);
    const upc = up(url.searchParams.get("upc"));

    if (!upc) {
      return NextResponse.json(
        { ok: false, error: "Missing ?upc=EGG" },
        { status: 400 },
      );
    }

    const catalog = await readTabAsObjects("Catalog");

    const row = catalog.rows.find((r) => up(r["upc"]) === upc);

    if (!row) {
      return NextResponse.json({
        ok: true,
        found: false,
        upc,
      });
    }

    return NextResponse.json({
      ok: true,
      found: true,
      upc,
      product_name: norm(row["product_name"]) || upc,
      base_unit: norm(row["base_unit"]) || "",
      reorder_point: toNumber(row["reorder_point"]),
      par_level: toNumber(row["par_level"]),
      default_location: norm(row["default_location"]) || "",
      preferred_vendor: norm(row["preferred_vendor"]) || "",
      active: norm(row["active"]) || "",
      notes: norm(row["notes"]) || "",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "catalog-item",
        error: err?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
