// app/api/inventory/daily-run/route.ts
import { NextResponse } from "next/server";

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function getInternalBase(url: URL) {
  // Allow manual override (debug)
  const queryBase = url.searchParams.get("base")?.trim();
  if (queryBase) return queryBase;

  // Preferred explicit config
  const envBase = process.env.INTERNAL_BASE_URL?.trim();
  if (envBase) return envBase;

  // ✅ Render-safe: call ourselves via loopback + PORT
  const port = process.env.PORT;
  const renderExternal = process.env.RENDER_EXTERNAL_URL; // usually exists on Render
  if (port && renderExternal) {
    return `http://127.0.0.1:${port}`;
  }

  // Local dev fallback
  return `${url.protocol}//${url.host}`;
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { cache: "no-store", headers });
  const text = await res.text();

  // Helpful when an endpoint returns HTML instead of JSON
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = {
      ok: false,
      error: "Non-JSON response",
      preview: text.slice(0, 200),
    };
  }

  return { res, json };
}

export async function GET(req: Request) {
  const started = Date.now();
  const url = new URL(req.url);

  const date = url.searchParams.get("date") || ymd();
  const base = getInternalBase(url);

  const internalKey = process.env.INTERNAL_API_KEY || "";
  const headers: Record<string, string> = internalKey
    ? { "x-api-key": internalKey }
    : {};

  try {
    // 1) Inventory usage ledger refresh
    const mathUrl = `${base}/api/inventory-math/run?date=${date}&mode=replace`;
    const { res: mathRes, json: mathJson } = await fetchJson(mathUrl, headers);

    if (!mathRes.ok || !mathJson?.ok) {
      return NextResponse.json(
        {
          ok: false,
          scope: "daily-run",
          step: "inventory-math",
          date,
          base,
          error: mathJson?.error || "inventory-math failed",
          math: mathJson,
          ms: Date.now() - started,
        },
        { status: 500 },
      );
    }

    // 2) Reorder check
    const checkUrl = `${base}/api/inventory/reorder-check`;
    const { res: checkRes, json: checkJson } = await fetchJson(
      checkUrl,
      headers,
    );

    if (!checkRes.ok || !checkJson?.ok) {
      return NextResponse.json(
        {
          ok: false,
          scope: "daily-run",
          step: "reorder-check",
          date,
          base,
          reorder_check: checkJson,
          ms: Date.now() - started,
        },
        { status: 500 },
      );
    }

    // 3) Email only if flagged
    let emailJson: any = { skipped: true, reason: "no_items_flagged" };

    if ((checkJson.items_flagged || 0) > 0) {
      const emailUrl = `${base}/api/inventory/reorder-email`;
      const { res: emailRes, json } = await fetchJson(emailUrl, headers);
      emailJson = json;

      if (!emailRes.ok || !emailJson?.ok) {
        return NextResponse.json(
          {
            ok: false,
            scope: "daily-run",
            step: "reorder-email",
            date,
            base,
            reorder_email: emailJson,
            ms: Date.now() - started,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      scope: "daily-run",
      date,
      base,
      ms: Date.now() - started,
      inventory_math: {
        rows_written: mathJson.rows_written,
        missing_recipes_count: (mathJson.missing_recipes || []).length,
      },
      reorder_check: checkJson,
      reorder_email: emailJson,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "daily-run",
        date,
        base,
        step: "fetch",
        error: e?.message || "fetch failed",
        ms: Date.now() - started,
      },
      { status: 500 },
    );
  }
}
