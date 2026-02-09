import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.TOAST_API_BASE;
  const clientId = process.env.TOAST_CLIENT_ID;
  const clientSecret = process.env.TOAST_CLIENT_SECRET;
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID;

  if (!base || !clientId || !clientSecret || !restaurantGuid) {
    return NextResponse.json(
      { ok: false, error: "Missing Toast env vars" },
      { status: 500 },
    );
  }

  // 1) Get token
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

  const authData = await authRes.json();
  const token = authData.token.accessToken;

  // 2) Call restaurant endpoint
  const res = await fetch(
    `${base}/restaurants/v1/restaurants/${restaurantGuid}?includeArchived=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Toast-Restaurant-External-ID": restaurantGuid,
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: "Restaurant fetch failed", details: text },
      { status: 403 },
    );
  }

  const data = await res.json();

  return NextResponse.json({
    ok: true,
    restaurantName: data?.name,
    locationCount: data?.locations?.length ?? 0,
  });
}
