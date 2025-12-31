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
    included_segments: ["Subscribed Users"],
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

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OneSignal error: ${res.status} ${txt}`);
  }

  return res.json();
}
