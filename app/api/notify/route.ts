import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { title, message, url } = await req.json();

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
      included_segments: ["Subscribed Users"],
      headings: { en: title },
      contents: { en: message },
      url: url || "https://www.inventory.alert.cbq.thetoolshed.app",
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
