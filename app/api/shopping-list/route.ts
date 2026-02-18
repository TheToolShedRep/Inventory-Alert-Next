import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";

function norm(v: any) {
  return String(v ?? "").trim();
}

export async function GET() {
  const started = Date.now();

  const data = await readTabAsObjects("Shopping_List");

  // Optional: filter out empty rows
  const rows = (data.rows || []).filter((r: any) => norm(r["upc"]));

  return NextResponse.json({
    ok: true,
    scope: "shopping-list",
    ms: Date.now() - started,
    count: rows.length,
    rows,
  });
}
