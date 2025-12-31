import { NextRequest } from "next/server";
import { cancelAlertById } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { alertId } = body;

    if (!alertId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing alertId" }),
        { status: 400 }
      );
    }

    const success = await cancelAlertById(alertId);

    if (!success) {
      return new Response(
        JSON.stringify({ ok: false, error: "Alert not found" }),
        { status: 404 }
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("Cancel alert failed:", err);
    return new Response(JSON.stringify({ ok: false, error: "Server error" }), {
      status: 500,
    });
  }
}
