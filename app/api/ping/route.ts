import { NextResponse } from "next/server";

export async function GET() {
  console.log("🔥 PING HIT", new Date().toISOString());
  return NextResponse.json({ ok: true, where: "local dev" });
}
