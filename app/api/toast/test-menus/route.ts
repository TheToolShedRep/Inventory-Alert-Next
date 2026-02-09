import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.TOAST_API_BASE!;
  const clientId = process.env.TOAST_CLIENT_ID!;
  const clientSecret = process.env.TOAST_CLIENT_SECRET!;
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID!;

  // auth
  const authRes = await fetch(
    `${base}/authentication/v1/authentication/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        userAccessType: "TOAST_MACHINE_CLIENT",
      }),
    },
  );

  if (!authRes.ok) {
    return NextResponse.json(
      { ok: false, error: "Auth failed" },
      { status: 401 },
    );
  }

  const { token } = await authRes.json();

  // menus
  const res = await fetch(`${base}/menus/v2/menus`, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Toast-Restaurant-External-ID": restaurantGuid,
    },
  });

  const text = await res.text();

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    preview: text.slice(0, 400),
  });
}
