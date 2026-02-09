import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const base = process.env.TOAST_API_BASE!;
  const clientId = process.env.TOAST_CLIENT_ID!;
  const clientSecret = process.env.TOAST_CLIENT_SECRET!;
  const restaurantGuid = process.env.TOAST_RESTAURANT_GUID!;

  try {
    // 1) AUTH
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

    const auth = await authRes.json();
    const token = auth.token.accessToken;

    // ======================================================
    // 🔒 PRODUCTION MODE — lightweight orders preview
    // ======================================================

    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

    const url = new URL(`${base}/orders/v2/ordersBulk`);
    url.searchParams.set("startDate", start.toISOString());
    url.searchParams.set("endDate", end.toISOString());

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Toast-Restaurant-External-ID": restaurantGuid,
      },
    });

    const text = await res.text();

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      // return only a short preview so we don't dump huge order data
      preview: text.slice(0, 400),
    });

    // ======================================================
    // 🧪 DEBUG MODE (COMMENTED OUT)
    // Used to verify modifier-level data (e.g. "The Outkast"
    // + protein modifiers like "Pork Bacon")
    //
    // Verified on 2026-02-02:
    // - Toast Orders API DOES include modifiers
    // - Protein choices appear as modifiers
    //
    // To re-enable:
    // - Uncomment block below
    // - Temporarily bypass ordersBulk preview
    // ======================================================

    /*
    const DEBUG_ORDER_GUID = "8419532a-41dd-46ea-a876-f2158c94386e";

    const debugRes = await fetch(
      `${base}/orders/v2/orders/${DEBUG_ORDER_GUID}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Toast-Restaurant-External-ID": restaurantGuid,
        },
      }
    );

    const debugOrder = await debugRes.json();

    return NextResponse.json({
      ok: true,
      debug: true,
      order: debugOrder,
    });
    */
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || error,
      },
      { status: 500 },
    );
  }
}
