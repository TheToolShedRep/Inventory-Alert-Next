// app/manager/page.tsx
import Link from "next/link";
import { getTodayAlerts } from "@/lib/sheets";

export const runtime = "nodejs";

export default async function ManagerPage() {
  const rows = await getTodayAlerts(); // returns raw rows for today

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <h1 style={{ margin: 0 }}>Manager Dashboard</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/checklist">Checklist</Link>
          <a href="/manager.csv">Export CSV</a>
        </nav>
      </header>

      <p style={{ opacity: 0.8 }}>All alerts logged today.</p>

      <div
        style={{
          overflowX: "auto",
          border: "1px solid #eee",
          borderRadius: 12,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {[
                "Timestamp",
                "Item",
                "Qty",
                "Location",
                "Note",
                "IP",
                "User Agent",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 12, opacity: 0.8 }}>
                  No alerts yet today.
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={idx}>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    {r.timestamp}
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    {r.item}
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    {r.qty}
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    {r.location}
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    {r.note || ""}
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    {r.ip || ""}
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    {r.userAgent || ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
