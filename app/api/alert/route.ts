import { NextResponse } from "next/server";
import { logAlertToSheet } from "@/lib/sheets";
import { sendOneSignalPush } from "@/lib/onesignal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Missing JSON body" },
        { status: 400 }
      );
    }

    const item = String(body.item || "").trim();
    const location = String(body.location || "").trim();
    const qty = String(body.qty || "").trim(); // "low" | "out"
    const note = String(body.note || "").trim();

    if (!item || !location || !qty) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: item, location, qty" },
        { status: 400 }
      );
    }

    // Grab some request context (optional)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    const userAgent = req.headers.get("user-agent") || "";

    const timestamp = new Date().toISOString();

    const alertId = `${Date.now()}_${item}_${location}`.toLowerCase();

    // 1) Log to Google Sheets
    await logAlertToSheet({
      item,
      qty,
      location,
      note,
      ip,
      userAgent,
      alertId,
    });

    // 2) Send OneSignal push (safe to fail without breaking logging)
    try {
      await sendOneSignalPush({
        title: `Inventory Alert: ${item}`,
        message: `${location} reported ${qty.toUpperCase()}${
          note ? ` — ${note}` : ""
        }`,
        url: `${
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
        }/checklist`,
      });
    } catch (e) {
      // Don’t fail the request if push fails
      console.warn("OneSignal push failed:", e);
    }

    return Response.json({ ok: true, alertId });
  } catch (e: any) {
    console.error("POST /api/alert failed:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
