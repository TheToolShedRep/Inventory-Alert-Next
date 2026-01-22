// lib/onesignal.ts
type SendPushArgs = {
  title: string;
  message: string;
  url?: string;
};

export async function sendOneSignalPush({ title, message, url }: SendPushArgs) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;

  if (!appId) throw new Error("Missing ONESIGNAL_APP_ID");
  if (!apiKey) throw new Error("Missing ONESIGNAL_API_KEY");

  const payload: any = {
    app_id: appId,
    headings: { en: title },
    contents: { en: message },
    included_segments: ["Subscribed Users"], // current targeting
  };

  if (url) payload.url = url;

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  // ✅ CHANGE: always read response text and log it
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep as text if not JSON
  }

  console.log("📣 OneSignal status:", res.status);
  console.log("📣 OneSignal response:", json ?? text);

  if (!res.ok) {
    throw new Error(
      `OneSignal error: ${res.status} ${json?.errors ?? text ?? "unknown"}`,
    );
  }

  // ✅ CHANGE: return parsed JSON (or raw if needed)
  return json ?? { ok: true, raw: text };
}
