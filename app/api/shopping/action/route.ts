// app/api/shopping/action/route.ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { appendShoppingAction, getBusinessDateNY } from "@/lib/sheets-core";

export const runtime = "nodejs";

function allowInternalKey(req: Request) {
  const key = req.headers.get("x-api-key");
  const expected = process.env.INTERNAL_API_KEY;
  return !!expected && key === expected;
}

/**
 * We support real UPC digits AND pseudo-UPCs like "EGG" / "TURKEY_SAUSAGE_PATTY".
 * So: trim only, no digits-only stripping.
 */
// function normalizeUpc(input: any) {
//   return (input ?? "").toString().trim();
// }

function normalizeUpc(input: any) {
  return (input ?? "").toString().trim().toUpperCase();
}

const ALLOWED_ACTIONS = new Set(["purchased", "dismissed", "snoozed", "undo"]);

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "POST JSON: { upc, action: 'purchased'|'dismissed'|'snoozed'|'undo', note?, date? }",
  });
}

export async function POST(req: Request) {
  // Auth gate: internal key OR Clerk user
  let actor = "internal";
  if (!allowInternalKey(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const user = await currentUser();
    actor =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      "clerk_user";
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const upc = normalizeUpc(body?.upc);
  const action = String(body?.action ?? "")
    .trim()
    .toLowerCase();
  const note = String(body?.note ?? "").trim();
  const date = getBusinessDateNY();
  // const date = String(body?.date ?? "").trim() || getBusinessDateNY();

  // 🔒 Validate date format (YYYY-MM-DD only)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  if (!upc) {
    return NextResponse.json(
      { ok: false, error: "Missing upc" },
      { status: 400 },
    );
  }

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      {
        ok: false,
        error: "action must be 'purchased', 'dismissed', 'snoozed', or 'undo'",
      },
      { status: 400 },
    );
  }

  console.log("✅ shopping action", { date, upc, action, actor, note });

  await appendShoppingAction({
    date,
    upc,
    action: action as "purchased" | "dismissed" | "snoozed" | "undo",
    note,
    actor,
  });

  return NextResponse.json({ ok: true });
}
