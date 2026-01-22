// app/api/alert/route.ts
import { NextResponse } from "next/server";
import { logAlertToSheet } from "@/lib/sheets";
import { sendOneSignalPush } from "@/lib/onesignal";
import { sendAlertEmail } from "@/lib/email";
import { getSubscriberEmails } from "@/lib/subscribers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const started = Date.now();
  console.log("✅ /api/alert HIT", new Date().toISOString());

  try {
    const raw = await req.text();
    console.log("✅ /api/alert RAW BODY:", raw);

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Missing JSON body" },
        { status: 400 },
      );
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch (e) {
      console.warn("❌ /api/alert invalid JSON body");
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const item = String(body.item || "").trim();
    const location = String(body.location || "").trim();
    const qty = String(body.qty || "").trim();
    const note = String(body.note || "").trim();

    // ✅ CHANGE: capture source ("qr" or "memo") and pass it downstream
    const source = String(body.source || "qr").trim();

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

    // 1️⃣ Log to Google Sheets (single source of truth)
    console.log("➡️ Logging to Sheets...");
    await logAlertToSheet({
      item,
      qty,
      location,
      note,
      // ✅ CHANGE: include source in the Sheets payload (so the sheet can store memo vs qr)
      source,
      ip,
      userAgent,
      alertId,
    });
    console.log("✅ Sheets log OK");

    // Build base URL safely
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://www.inventory.alert.cbq.thetoolshed.app";

    const checklistUrl = `${baseUrl.replace(/\/$/, "")}/checklist`;

    // 2️⃣ Email alert to subscribers (do not block overall success)
    try {
      console.log("➡️ Fetching subscriber emails...");

      const subResult: any = await getSubscriberEmails();

      // Support either:
      // - string[]  (["a@x.com", "b@y.com"])
      // - { emails: string[] }
      // - { ok: true, emails: string[] }
      const subscriberEmails: string[] = Array.isArray(subResult)
        ? subResult
        : Array.isArray(subResult?.emails)
          ? subResult.emails
          : [];

      // If nobody subscribed yet, fall back to ALERT_EMAIL_TO (optional)
      const fallbackTo = process.env.ALERT_EMAIL_TO || "";
      const recipients =
        subscriberEmails.length > 0
          ? subscriberEmails
          : fallbackTo
            ? [fallbackTo]
            : [];

      console.log("✅ Subscribers:", subscriberEmails.length);
      console.log("✅ Email recipients:", recipients);

      if (recipients.length === 0) {
        console.warn(
          "⚠️ No recipients found (no subscribers, no ALERT_EMAIL_TO). Skipping email.",
        );
      } else {
        // ✅ CHANGE: capture and log the Resend result (includes id) for tracing deliverability
        const emailResult = await sendAlertEmail({
          to: recipients,
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

        console.log("✅ Email alert result:", emailResult);
      }
    } catch (e: any) {
      console.warn("⚠️ Email alert failed:", e?.message || e);
    }

    // 3️⃣ Push notification (do not block success)
    try {
      console.log("➡️ Sending OneSignal push...");
      await sendOneSignalPush({
        title: `Inventory Alert: ${item}`,
        message: `${location} reported ${qty.toUpperCase()}${
          note ? ` — ${note}` : ""
        }`,
        url: checklistUrl,
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
      { status: 500 },
    );
  }
}
