// app/api/toast/sales-sync/route.ts
//
// Purpose:
// - Pull Toast orders for a date window (default: yesterday UTC or ?date=YYYY-MM-DD)
// - Aggregate menu item quantities
// - Virtualize "The Outkast" into variant keys based on modifiers:
//   - Protein (required): pork bacon / turkey bacon / pork sausage / turkey sausage / egg
//   - Cheese (optional replacement): cheddar (American is assumed default)
//
// Output written to Sales sheet via appendSalesRows()

import { NextResponse } from "next/server";
import { appendSalesRows } from "@/lib/sales";

import {
  cleanName,
  extractProteinModifier,
  extractCheeseModifier,
  buildVirtualMenuKey,
} from "@/lib/toast/normalize";

type ItemAgg = Record<string, number>;

function ymd(d: Date) {
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const base = process.env.TOAST_API_BASE!;
  const clientId = process.env.TOAST_CLIENT_ID!;
  const clientSecret = process.env.TOAST_CLIENT_SECRET!;
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID!;

  const { searchParams } = new URL(req.url);

  // Choose a date to sync, default = yesterday (UTC)
  const dateParam = searchParams.get("date"); // "YYYY-MM-DD"
  const target = dateParam
    ? new Date(`${dateParam}T00:00:00.000Z`)
    : new Date(Date.now() - 86400000);

  const start = new Date(target);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const salesDate = ymd(start);

  // 1) Auth
  const authRes = await fetch(
    `${base}/authentication/v1/authentication/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
    },
  );

  if (!authRes.ok) {
    const text = await authRes.text();
    return NextResponse.json(
      { ok: false, error: "Auth failed", details: text },
      { status: 401 },
    );
  }

  const auth = await authRes.json();
  const token = auth?.token?.accessToken;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "No access token returned" },
      { status: 401 },
    );
  }

  // 2) ordersBulk
  const url = new URL(`${base}/orders/v2/ordersBulk`);
  url.searchParams.set("startDate", start.toISOString());
  url.searchParams.set("endDate", end.toISOString());

  const ordersRes = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": restaurantGuid,
    },
  });

  if (!ordersRes.ok) {
    const text = await ordersRes.text();
    return NextResponse.json(
      {
        ok: false,
        error: "Orders fetch failed",
        status: ordersRes.status,
        details: text,
      },
      { status: ordersRes.status },
    );
  }

  const orders = await ordersRes.json();

  // 3) Aggregate menu items
  const agg: ItemAgg = {};

  // Optional: leave this false in normal use.
  // If true, it will log (not return) Outkast lines that are missing protein detection.
  const LOG_UNKNOWN_OUTKAST = false;

  for (const order of orders || []) {
    const checks = order?.checks || [];
    for (const check of checks) {
      const selections = check?.selections || [];
      for (const sel of selections) {
        if (sel?.voided === true) continue;

        // Base menu item name (Toast line item)
        const baseDisplayName = (
          sel?.displayName ||
          sel?.item?.name ||
          sel?.item?.displayName ||
          ""
        )
          .toString()
          .trim();

        if (!baseDisplayName) continue;

        // Modifier display names (if any)
        const modifierNames: string[] = Array.isArray(sel?.modifiers)
          ? sel.modifiers.map((m: any) => (m?.displayName || "").toString())
          : [];

        // 🔎 TEMP DEBUG: detect cheddar modifier anywhere
        // const DEBUG_FIND_OUTKAST_CHEDDAR = true;

        // if (DEBUG_FIND_OUTKAST_CHEDDAR) {
        //   const baseClean = cleanName(baseDisplayName);
        //   const hasCheddar = modifierNames.some((m) =>
        //     cleanName(m).includes("cheddar"),
        //   );

        //   if (baseClean === "the outkast" && hasCheddar) {
        //     return NextResponse.json({
        //       ok: true,
        //       debug: true,
        //       message: "Found Outkast with cheddar modifier",
        //       date: salesDate,
        //       baseDisplayName,
        //       modifierNames,
        //     });
        //   }
        // }

        // Detect Outkast-specific modifiers
        const protein = extractProteinModifier(modifierNames);
        const cheese = extractCheeseModifier(modifierNames);

        // Build stable Sales key (virtualizes The Outkast)
        // Examples:
        // - "The Outkast" + "Pork Bacon" → "the outkast - pork bacon"
        // - "The Outkast" + "Turkey Sausage Patty" → "the outkast - turkey sausage"
        // - If cheddar selected → "... - cheddar"
        const menuKey = buildVirtualMenuKey(baseDisplayName, protein, cheese);

        // Optional logging for Outkast lines where protein wasn't detected
        if (LOG_UNKNOWN_OUTKAST) {
          const baseClean = cleanName(baseDisplayName);
          if (baseClean === "the outkast" && !protein) {
            console.warn("[sales-sync] Outkast missing protein modifier", {
              date: salesDate,
              baseDisplayName,
              modifierNames,
            });
          }
        }

        // Quantity
        const qty = Number(sel?.quantity ?? 1);
        const safeQty = Number.isFinite(qty) ? qty : 1;

        // Aggregate
        agg[menuKey] = (agg[menuKey] || 0) + safeQty;
      }
    }
  }

  const rows = Object.entries(agg)
    .map(([menu_item, qty_sold]) => ({
      date: salesDate,
      menu_item,
      qty_sold,
      source: "toast",
    }))
    .filter((r) => r.qty_sold > 0);

  // 4) Write to Sales sheet
  await appendSalesRows(rows);

  return NextResponse.json({
    ok: true,
    date: salesDate,
    window: { start: start.toISOString(), end: end.toISOString() },
    rows_written: rows.length,
    top_10: rows.sort((a, b) => b.qty_sold - a.qty_sold).slice(0, 10),
    note: "Sales now virtualizes The Outkast by protein modifier and optionally adds '- cheddar' when cheddar is selected.",
  });
}
