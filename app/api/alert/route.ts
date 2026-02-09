// app/api/alert/route.ts
import { NextResponse } from "next/server";
import { logAlertToSheet } from "@/lib/sheets";
import { sendOneSignalPush } from "@/lib/onesignal";
import { sendAlertEmail } from "@/lib/email";
import { getSubscriberEmails } from "@/lib/subscribers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  console.log("🔥 LOCAL ALERT HIT (TOP)");
  // console.log("✅ /api/alert HIT", new Date().toISOString());

  try {
    const raw = await req.text();
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing JSON body" },
        { status: 400 },
      );
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const item = String(body.item || "").trim();
    const location = String(body.location || "").trim();
    const qty = String(body.qty || "").trim();
    const note = String(body.note || "").trim();

    // optional
    const source = String(body.source || "").trim();

    console.log("✅ /api/alert PARSED:", { item, location, qty, note, source });

    if (!item || !location || !qty) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: item, location, qty" },
        { status: 400 },
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";

    const userAgent = req.headers.get("user-agent") || "";

    const alertId = `${Date.now()}_${item}_${location}`.toLowerCase();

    // 1) Sheets (authoritative)
    await logAlertToSheet({
      item,
      qty,
      location,
      note,
      ip,
      userAgent,
      alertId,
      source, // optional; sheets.ts will append it only if header exists
    });

    // 2) Email (non-blocking)
    try {
      const subResult: any = await getSubscriberEmails();
      const subscriberEmails: string[] = Array.isArray(subResult)
        ? subResult
        : Array.isArray(subResult?.emails)
          ? subResult.emails
          : [];

      const fallbackTo = process.env.ALERT_EMAIL_TO || "";
      const recipients =
        subscriberEmails.length > 0
          ? subscriberEmails
          : fallbackTo
            ? [fallbackTo]
            : [];

      if (recipients.length > 0) {
        await sendAlertEmail({
          to: recipients,
          subject: `Inventory Alert: ${item} (${qty.toUpperCase()})`,
          html: `
            <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height:1.4;">
              <h2>Inventory Alert</h2>
              <p><b>Item:</b> ${item}</p>
              <p><b>Location:</b> ${location}</p>
              <p><b>Status:</b> ${qty.toUpperCase()}</p>
              ${note ? `<p><b>Note:</b> ${note}</p>` : ""}
            </div>
          `,
        });
      }
    } catch (e: any) {
      console.warn("⚠️ Email failed:", e?.message || e);
    }

    // 3) Push (non-blocking)
    try {
      await sendOneSignalPush({
        title: `Inventory Alert: ${item}`,
        message: `${location} reported ${qty.toUpperCase()}${
          note ? ` — ${note}` : ""
        }`,
      });
    } catch (e: any) {
      console.warn("⚠️ Push failed:", e?.message || e);
    }

    console.log("✅ /api/alert DONE", alertId);

    return NextResponse.json({ ok: true, alertId });
  } catch (e: any) {
    console.error("❌ POST /api/alert failed:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 },
    );
  }
}
