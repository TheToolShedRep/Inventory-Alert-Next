// app/api/notify/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Sends a OneSignal notification (server-side).
 *
 * ✅ Changes / Adds:
 * 1) Uses ONESIGNAL_APP_ID (server env var), not NEXT_PUBLIC_ONESIGNAL_APP_ID
 * 2) Validates required env vars and request body
 * 3) Logs OneSignal status + response to help debug "sent but not delivered"
 * 4) Handles OneSignal returning 200 with errors (common)
 */
export async function POST(req: Request) {
  try {
    const { title, message, url } = await req.json();

    if (!title || !message) {
      return NextResponse.json(
        { ok: false, error: "Missing title or message" },
        { status: 400 },
      );
    }

    const appId = process.env.ONESIGNAL_APP_ID; // ✅ server env var
    const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId) {
      return NextResponse.json(
        { ok: false, error: "Missing ONESIGNAL_APP_ID env var" },
        { status: 500 },
      );
    }

    if (!restApiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ONESIGNAL_REST_API_KEY env var" },
        { status: 500 },
      );
    }

    const payload = {
      app_id: appId,
      included_segments: ["Subscribed Users"],
      headings: { en: String(title) },
      contents: { en: String(message) },
      url: url || "https://www.inventory.alert.cbq.thetoolshed.app",
    };

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    // ✅ Always read response safely (can be JSON or text)
    const text = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    console.log("📣 OneSignal status:", res.status);
    console.log("📣 OneSignal app_id used:", appId);
    console.log("📣 OneSignal response:", data);

    // ✅ OneSignal can return 200 but still have errors
    if (!res.ok || (data && Array.isArray(data.errors) && data.errors.length)) {
      return NextResponse.json(
        { ok: false, onesignalStatus: res.status, ...data },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, ...data }, { status: 200 });
  } catch (e: any) {
    console.error("❌ /api/notify failed:", e?.message || e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 },
    );
  }
}
