// app/checklist/page.tsx
import Link from "next/link";
import { getTodayChecklist } from "@/lib/sheets";

export const runtime = "nodejs";

export default async function ChecklistPage() {
  const items = await getTodayChecklist(); // returns deduped "low/out" items

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <h1 style={{ margin: 0 }}>Today’s Checklist</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/manager">Manager</Link>
          <Link href="/alert?item=milk&location=kitchen">Test Alert</Link>
        </nav>
      </header>

      <p style={{ opacity: 0.8 }}>Low / Empty items reported today.</p>

      {items.length === 0 ? (
        <div
          style={{ padding: 16, border: "1px solid #eee", borderRadius: 12 }}
        >
          No alerts yet today.
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            marginTop: 16,
            display: "grid",
            gap: 10,
          }}
        >
          {items.map((it) => (
            <li
              key={`${it.item}|${it.location}`}
              style={{
                padding: 14,
                border: "1px solid #eee",
                borderRadius: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{it.item}</div>
                <div style={{ opacity: 0.75 }}>{it.location}</div>
                {it.note ? (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    Note: {it.note}
                  </div>
                ) : null}
              </div>

              <div style={{ fontWeight: 700 }}>{it.qty.toUpperCase()}</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
