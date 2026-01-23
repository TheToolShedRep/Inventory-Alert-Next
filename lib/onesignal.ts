// lib/onesignal.ts

/**
 * OneSignal Push Sender (Server-side)
 *
 * What changed / added:
 * 1) ✅ Uses ONESIGNAL_REST_API_KEY (recommended naming) instead of ambiguous "API_KEY"
 * 2) ✅ Always logs the HTTP status + response body from OneSignal
 * 3) ✅ Treats OneSignal "errors" as a real failure (even if HTTP is 200)
 * 4) ✅ Optional test mode:
 *    - If ONESIGNAL_TEST_SUBSCRIPTION_IDS is set (comma-separated),
 *      we send directly to those subscription IDs instead of "Subscribed Users" segment.
 *
 * Why:
 * - Your logs show: { id: '', errors: ['All included players are not subscribed'] }
 *   That means OneSignal accepted the request, but targeted 0 recipients.
 */

type SendPushArgs = {
  title: string;
  message: string;
  url?: string;
};

function parseCommaList(v?: string) {
  return (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendOneSignalPush({ title, message, url }: SendPushArgs) {
  // App ID can be stored either as NEXT_PUBLIC_* or server-side. We'll accept either.
  const appId =
    process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

  // IMPORTANT: use the REST API Key for server calls.
  // If you already have ONESIGNAL_REST_API_KEY in Render, prefer it.
  const restApiKey =
    process.env.ONESIGNAL_REST_API_KEY || process.env.ONESIGNAL_API_KEY;

  if (!appId)
    throw new Error("Missing ONESIGNAL_APP_ID or NEXT_PUBLIC_ONESIGNAL_APP_ID");
  if (!restApiKey)
    throw new Error(
      "Missing ONESIGNAL_REST_API_KEY (or ONESIGNAL_API_KEY fallback)",
    );

  // ✅ Optional: direct targeting for testing delivery (bypasses segments)
  // Put your Subscription IDs here as a comma-separated list:
  // ONESIGNAL_TEST_SUBSCRIPTION_IDS=abc,def,ghi
  const testSubscriptionIds = parseCommaList(
    process.env.ONESIGNAL_TEST_SUBSCRIPTION_IDS,
  );

  // Base payload
  const payload: any = {
    app_id: appId,
    headings: { en: title },
    contents: { en: message },
  };

  // ✅ If you set test IDs, send to them directly (best for debugging)
  // Otherwise, use the segment.
  if (testSubscriptionIds.length > 0) {
    // OneSignal docs often refer to "subscription id" for the new model.
    // Some accounts still accept include_player_ids for legacy.
    // We'll try subscription IDs first.
    payload.include_subscription_ids = testSubscriptionIds;

    // NOTE: If your OneSignal account doesn’t support include_subscription_ids,
    // we’ll switch to include_player_ids after you tell me what response you get.
  } else {
    payload.included_segments = ["Subscribed Users"];
  }

  if (url) payload.url = url;

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${restApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  // ✅ Always read response body for logs + debugging
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave json as null; we'll keep raw text
  }

  console.log("📣 OneSignal status:", res.status);
  console.log("📣 OneSignal response:", json ?? text);

  // ✅ If HTTP is not OK, fail hard
  if (!res.ok) {
    throw new Error(`OneSignal HTTP error: ${res.status} ${text}`);
  }

  // ✅ IMPORTANT: Even with HTTP 200, OneSignal can return { errors: [...] }
  // Your logs show exactly that, so we treat it as a failure.
  if (json?.errors?.length) {
    throw new Error(`OneSignal errors: ${json.errors.join(" | ")}`);
  }

  return json ?? { ok: true, raw: text };
}
