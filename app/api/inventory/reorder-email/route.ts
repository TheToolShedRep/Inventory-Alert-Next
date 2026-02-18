// app/api/inventory/reorder-email/route.ts
import { NextResponse } from "next/server";
import { readTabAsObjects } from "@/lib/sheets/read";
import { sendAlertEmail } from "@/lib/email";
import { requireInternalKey } from "@/lib/auth/internal";

function norm(v: any) {
  return String(v ?? "").trim();
}

function toNumber(v: any) {
  const s = norm(v);
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const deny = requireInternalKey(req);
  if (deny) return deny;

  const started = Date.now();

  try {
    const [subs, list] = await Promise.all([
      readTabAsObjects("Subscribers"),
      readTabAsObjects("Shopping_List"),
    ]);

    const emails = subs.rows
      .map((r) => norm(r["email"]))
      .filter((e) => e.includes("@"));

    if (emails.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          scope: "reorder-email",
          error: "No subscriber emails found",
        },
        { status: 400 },
      );
    }

    const items = list.rows.map((r) => ({
      upc: norm(r["upc"]),
      product_name: norm(r["product_name"]),
      on_hand: toNumber(r["on_hand_base_units"]),
      base_unit: norm(r["base_unit"]) || "each",
      reorder_point: toNumber(r["reorder_point"]),
      par_level: toNumber(r["par_level"]),
      qty_to_order: toNumber(r["qty_to_order_base_units"]),
      preferred_vendor: norm(r["preferred_vendor"]),
      default_location: norm(r["default_location"]),
      note: norm(r["note"]),
    }));

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        scope: "reorder-email",
        message: "No items flagged. Nothing emailed.",
        emailed_to: 0,
        items: 0,
        ms: Date.now() - started,
      });
    }

    const subject = `Shopping List (${items.length} item${items.length === 1 ? "" : "s"})`;

    const rowsHtml = items
      .map((it) => {
        const vendor = it.preferred_vendor ? ` • ${it.preferred_vendor}` : "";
        const loc = it.default_location ? ` • ${it.default_location}` : "";
        const note = it.note ? ` • <strong>NOTE:</strong> ${it.note}` : "";
        const par = it.par_level > 0 ? ` • Par: ${it.par_level}` : "";

        return `
          <li>
            <strong>${it.product_name}</strong> (${it.upc}) —
            On hand: ${it.on_hand} ${it.base_unit} •
            Reorder @ ${it.reorder_point}${par} •
            Order: <strong>${it.qty_to_order}</strong>
            ${vendor}${loc}${note}
          </li>
        `;
      })
      .join("");

    const html = `
      <h2>Shopping List</h2>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      <ul>${rowsHtml}</ul>
      <p>— Inventory Alert System</p>
    `;

    // ✅ ONE request to Resend (prevents 2 req/s rate limit)
    const sendRes = await sendAlertEmail({
      to: emails, // <-- array is supported by your lib/email.ts
      subject,
      html,
    });

    return NextResponse.json({
      ok: true,
      scope: "reorder-email",
      emailed_to: emails.length,
      items: items.length,
      send_result: sendRes,
      ms: Date.now() - started,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        scope: "reorder-email",
        error: e?.message || "Server error",
      },
      { status: 500 },
    );
  }
}
