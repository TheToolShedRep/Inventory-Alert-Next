import { NextResponse } from "next/server";
import { logAlertToSheet } from "@/lib/sheets";
import { sendOneSignalPush } from "@/lib/onesignal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const started = Date.now();
  console.log("✅ /api/alert HIT", new Date().toISOString());

  try {
    // Read raw body first so we can log it even if JSON parsing fails
    const raw = await req.text();
    console.log("✅ /api/alert RAW BODY:", raw);

    const body = raw ? JSON.parse(raw) : null;
    if (!body) {
      console.warn("❌ /api/alert missing JSON body");
      return NextResponse.json(
        { ok: false, error: "Missing JSON body" },
        { status: 400 }
      );
    }

    const item = String(body.item || "").trim();
    const location = String(body.location || "").trim();
    const qty = String(body.qty || "").trim(); // "low" | "out"
    const note = String(body.note || "").trim();

    console.log("✅ /api/alert PARSED:", { item, location, qty, note });

    if (!item || !location || !qty) {
      console.warn("❌ /api/alert missing required fields");
      return NextResponse.json(
        { ok: false, error: "Missing required fields: item, location, qty" },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    const userAgent = req.headers.get("user-agent") || "";

    const alertId = `${Date.now()}_${item}_${location}`.toLowerCase();

    // 1) Log to Google Sheets
    try {
      console.log("➡️ Logging to Sheets...");
      await logAlertToSheet({
        item,
        qty,
        location,
        note,
        ip,
        userAgent,
        alertId,
      });
      console.log("✅ Sheets log OK");
    } catch (e: any) {
      console.error("❌ Sheets log FAILED:", e?.message || e);
      // IMPORTANT: Return failure so we know this is the blocker
      return NextResponse.json(
        {
          ok: false,
          error: "Sheets logging failed",
          details: String(e?.message || e),
        },
        { status: 500 }
      );
    }

    // 2) Send OneSignal push (safe to fail without breaking logging)
    try {
      console.log("➡️ Sending OneSignal push...");
      await sendOneSignalPush({
        title: `Inventory Alert: ${item}`,
        message: `${location} reported ${qty.toUpperCase()}${
          note ? ` — ${note}` : ""
        }`,
        url: `${
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
        }/checklist`,
      });
      console.log("✅ OneSignal send OK");
    } catch (e: any) {
      console.warn("⚠️ OneSignal push failed:", e?.message || e);
    }

    console.log("✅ /api/alert DONE", { alertId, ms: Date.now() - started });
    return NextResponse.json({ ok: true, alertId });
  } catch (e: any) {
    console.error("❌ POST /api/alert failed:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
