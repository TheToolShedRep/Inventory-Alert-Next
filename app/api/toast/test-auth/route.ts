import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.TOAST_API_BASE;
  const clientId = process.env.TOAST_CLIENT_ID;
  const clientSecret = process.env.TOAST_CLIENT_SECRET;

  if (!base || !clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "Missing Toast env vars" },
      { status: 500 },
    );
  }

  const res = await fetch(`${base}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      clientSecret,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: "Auth failed", details: text },
      { status: 401 },
    );
  }

  const data = await res.json();

  return NextResponse.json({
    ok: true,
    hasToken: Boolean(data?.token?.accessToken),
    expiresAt: data?.token?.expiresAt,
  });
}
