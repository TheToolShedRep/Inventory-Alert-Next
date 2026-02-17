// app/api/inventory/daily-run/route.ts
import { NextResponse } from "next/server";
import { appendRowsHeaderDriven } from "@/lib/sheets/sheets-utils";

function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Daily Run Orchestrator (MVP)
 * ---------------------------
 * Runs the full daily pipeline:
 *  1) inventory-math/run (mode=replace) -> writes Inventory_Usage for the date
 *  2) inventory/reorder-check           -> overwrites Shopping_List
 *  3) inventory/reorder-email           -> emails subscribers (only if items_flagged > 0)
 *
 * Adds auditable logging to System_Log (append-only).
 *
 * Required Sheet: System_Log (tab)
 * Headers must include:
 *  timestamp
 *  date
 *  inventory_rows_written
 *  items_flagged
 *  emails_sent
 *  duration_ms
 *  status
 *  notes
 */
export async function GET(req: Request) {
  const started = Date.now();
  const url = new URL(req.url);

  // Optional override: ?date=YYYY-MM-DD
  const date = url.searchParams.get("date") || ymd();

  // Optional: ?base=http://localhost:3000 (defaults to same host)
  const base = url.searchParams.get("base") || `${url.protocol}//${url.host}`;

  // Track step + partial results so we can log useful error context
  let step: "inventory-math" | "reorder-check" | "reorder-email" | "unknown" =
    "unknown";

  let mathJson: any = null;
  let checkJson: any = null;
  let emailJson: any = { skipped: true, reason: "no_items_flagged" };

  // Helper: log to System_Log, but never let logging crash the pipeline response
  async function logSystemRun(params: {
    status: "success" | "error";
    notes?: string;
  }) {
    try {
      const totalMs = Date.now() - started;

      await appendRowsHeaderDriven({
        tabName: "System_Log",
        rowObjects: [
          {
            timestamp: new Date().toISOString(),
            date,
            inventory_rows_written:
              params.status === "success"
                ? Number(mathJson?.rows_written || 0)
                : "",
            items_flagged:
              params.status === "success"
                ? Number(checkJson?.items_flagged || 0)
                : "",
            emails_sent:
              params.status === "success"
                ? Number(emailJson?.emailed_to || 0)
                : "",
            duration_ms: totalMs,
            status: params.status,
            // Keep notes short + useful; include step for errors
            notes: params.notes || "",
          },
        ],
      });
    } catch (logErr: any) {
      console.warn(
        "⚠️ System_Log write failed (non-fatal):",
        logErr?.message || logErr,
      );
    }
  }

  try {
    // 1) Inventory usage ledger refresh
    step = "inventory-math";
    const mathUrl = `${base}/api/inventory-math/run?date=${date}&mode=replace`;
    const mathRes = await fetch(mathUrl, { cache: "no-store" });
    mathJson = await mathRes.json();

    if (!mathRes.ok || !mathJson?.ok) {
      await logSystemRun({
        status: "error",
        notes: `step=${step}; ${mathJson?.error || "inventory-math failed"}`,
      });

      return NextResponse.json(
        {
          ok: false,
          scope: "daily-run",
          step,
          date,
          math: mathJson,
          ms: Date.now() - started,
        },
        { status: 500 },
      );
    }

    // 2) Reorder check → writes Shopping_List
    step = "reorder-check";
    const checkUrl = `${base}/api/inventory/reorder-check`;
    const checkRes = await fetch(checkUrl, { cache: "no-store" });
    checkJson = await checkRes.json();

    if (!checkRes.ok || !checkJson?.ok) {
      await logSystemRun({
        status: "error",
        notes: `step=${step}; ${checkJson?.error || "reorder-check failed"}`,
      });

      return NextResponse.json(
        {
          ok: false,
          scope: "daily-run",
          step,
          date,
          reorder_check: checkJson,
          ms: Date.now() - started,
        },
        { status: 500 },
      );
    }

    // 3) Email only if something is flagged
    step = "reorder-email";
    emailJson = { skipped: true, reason: "no_items_flagged" };

    if ((checkJson.items_flagged || 0) > 0) {
      const emailUrl = `${base}/api/inventory/reorder-email`;
      const emailRes = await fetch(emailUrl, { cache: "no-store" });
      emailJson = await emailRes.json();

      if (!emailRes.ok || !emailJson?.ok) {
        await logSystemRun({
          status: "error",
          notes: `step=${step}; ${emailJson?.error || "reorder-email failed"}`,
        });

        return NextResponse.json(
          {
            ok: false,
            scope: "daily-run",
            step,
            date,
            reorder_email: emailJson,
            ms: Date.now() - started,
          },
          { status: 500 },
        );
      }
    }

    // ✅ Success log
    await logSystemRun({
      status: "success",
      notes:
        (checkJson.items_flagged || 0) > 0
          ? "ok"
          : "ok; no items flagged; email skipped",
    });

    return NextResponse.json({
      ok: true,
      scope: "daily-run",
      date,
      ms: Date.now() - started,
      inventory_math: {
        rows_written: Number(mathJson.rows_written || 0),
        missing_recipes_count: (mathJson.missing_recipes || []).length,
      },
      reorder_check: checkJson,
      reorder_email: emailJson,
    });
  } catch (e: any) {
    await logSystemRun({
      status: "error",
      notes: `step=${step}; ${e?.message || "Server error"}`,
    });

    return NextResponse.json(
      {
        ok: false,
        scope: "daily-run",
        date,
        step,
        error: e?.message || "Server error",
        ms: Date.now() - started,
      },
      { status: 500 },
    );
  }
}
