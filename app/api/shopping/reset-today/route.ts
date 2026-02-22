// app/api/shopping/reset-today/route.ts
import { NextResponse } from "next/server";
import { requireInternalKey } from "@/lib/auth/internal";
import {
  appendShoppingAction,
  getBusinessDateNY,
  getShoppingList,
} from "@/lib/sheets-core";

export const runtime = "nodejs";

function normUpc(v: any): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

export async function GET(req: Request) {
  const deny = requireInternalKey(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  const businessDate = getBusinessDateNY();

  // All items (merged) regardless of state
  const allRows = await getShoppingList({ includeHidden: true });

  // Visible items (merged) with hide rules applied
  const visibleRows = await getShoppingList({ includeHidden: false });

  const allUpcs = new Set(allRows.map((r) => normUpc(r.upc)));
  const visibleUpcs = new Set(visibleRows.map((r) => normUpc(r.upc)));

  // Hidden = present in all but not present in visible
  const hiddenUpcs = Array.from(allUpcs).filter(
    (u) => u && !visibleUpcs.has(u),
  );

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      scope: "shopping-reset-today",
      dryRun: true,
      businessDate,
      hidden_count: hiddenUpcs.length,
      hidden_upcs: hiddenUpcs,
    });
  }

  // Write an undo action for each hidden UPC (today)
  for (const upc of hiddenUpcs) {
    await appendShoppingAction({
      date: businessDate,
      upc,
      action: "undo",
      note: "reset-today",
      actor: "internal_key",
    });
  }

  return NextResponse.json({
    ok: true,
    scope: "shopping-reset-today",
    dryRun: false,
    businessDate,
    reset_count: hiddenUpcs.length,
    reset_upcs: hiddenUpcs,
  });
}
