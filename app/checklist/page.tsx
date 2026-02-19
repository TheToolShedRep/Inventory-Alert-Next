// app/checklist/page.tsx
import Link from "next/link";
import { getShoppingList, getTodayChecklist } from "@/lib/sheets";
import ChecklistClient from "./ChecklistClient";
import AppShell from "@/app/components/AppShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ hidden?: string }>;
}) {
  const params = await searchParams;
  const includeHidden = params?.hidden === "1";
  const hiddenHref = includeHidden ? "/checklist" : "/checklist?hidden=1";

  const [items, shoppingList] = await Promise.all([
    getTodayChecklist(),
    getShoppingList({ includeHidden }),
  ]);

  return (
    <AppShell title="Today’s Checklist">
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <header
          style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
        >
          <nav style={{ display: "flex", gap: 12 }}>
            <Link href="/manager">Manager</Link>
            <Link href={hiddenHref}>
              {includeHidden ? "Hide hidden" : "Show hidden"}
            </Link>
            <Link href="/alert?item=milk&location=kitchen">Test Alert</Link>
          </nav>
        </header>

        <p style={{ opacity: 0.8 }}>Low / Empty items reported today.</p>

        {/* Auto reorder section */}
        <section style={{ marginTop: 16, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px 0" }}>Auto Reorder (Shopping List)</h2>

          {shoppingList.length === 0 ? (
            <p style={{ opacity: 0.75 }}>
              No items currently flagged for reorder.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {shoppingList.map((r: any, idx: number) => {
                const upc = String(r.upc || "").trim();
                const returnTo = "/checklist";
                return (
                  <li key={`${upc || idx}`} style={{ marginBottom: 10 }}>
                    <strong>{r.product_name || upc}</strong> — order{" "}
                    <strong>{r.qty_to_order_base_units ?? ""}</strong>{" "}
                    {r.base_unit || ""}{" "}
                    {r.preferred_vendor ? `(${r.preferred_vendor})` : ""}{" "}
                    <span style={{ marginLeft: 10 }}>
                      <Link
                        href={`/purchase?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                      >
                        Restocked
                      </Link>
                      {" • "}
                      <Link
                        href={`/shopping/dismiss?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                      >
                        Dismiss
                      </Link>
                      {" • "}
                      <Link
                        href={`/shopping/snooze?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                      >
                        Snooze
                      </Link>
                      {" • "}
                      <Link
                        href={`/shopping/undo?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                        style={{ opacity: 0.8 }}
                      >
                        Undo
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <ChecklistClient
          initialItems={items.map((it) => ({
            timestamp: it.timestamp,
            item: it.item,
            qty: it.qty,
            location: it.location,
            note: it.note,
            alertId: it.alertId,
          }))}
        />
      </main>
    </AppShell>
  );
}
