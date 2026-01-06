// app/api/alert/route.ts
import { NextResponse } from "next/server";
import { logAlertToSheet } from "@/lib/sheets";
import { sendOneSignalPush } from "@/lib/onesignal";
import { sendAlertEmail } from "@/lib/email";

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

    // 1) Log to Google Sheets (ONLY ONCE)
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
      return NextResponse.json(
        {
          ok: false,
          error: "Sheets logging failed",
          details: String(e?.message || e),
        },
        { status: 500 }
      );
    }

    // 1.5) Send email alert (temporary fallback)
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        "https://www.inventory.alert.cbq.thetoolshed.app";

      const checklistUrl = `${baseUrl}/checklist`;

      await sendAlertEmail({
        subject: `Inventory Alert: ${item} (${qty.toUpperCase()})`,
        html: `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.4;">
            <h2>Inventory Alert</h2>
            <p><b>Item:</b> ${item}</p>
            <p><b>Location:</b> ${location}</p>
            <p><b>Status:</b> ${qty.toUpperCase()}</p>
            ${note ? `<p><b>Note:</b> ${note}</p>` : ""}
            <p style="margin-top:16px;">
              <a href="${checklistUrl}" style="padding:10px 14px;background:#111827;color:#fff;border-radius:8px;text-decoration:none;">
                Open Checklist
              </a>
            </p>
          </div>
        `,
      });

      console.log("✅ Email alert sent");
    } catch (e: any) {
      console.warn("⚠️ Email alert failed:", e?.message || e);
      // Do NOT fail the request if email fails
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
          process.env.NEXT_PUBLIC_BASE_URL ||
          "https://www.inventory.alert.cbq.thetoolshed.app"
        }/checklist`,
      });
      console.log("✅ OneSignal send OK");
    } catch (e: any) {
      console.warn("⚠️ OneSignal push failed:", e?.message || e);
      // Do NOT fail the request if push fails
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
