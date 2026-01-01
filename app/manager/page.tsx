// app/manager/page.tsx
import Link from "next/link";
import { getTodayAlerts } from "@/lib/sheets";

export const runtime = "nodejs";

/**
 * Interprets qty text into a simple severity level for styling.
 * Adjust these mappings if your staff uses different words.
 */
function getQtyLevel(qtyRaw: string): "out" | "low" | "other" {
  const q = (qtyRaw || "").trim().toLowerCase();

  // OUT / empty signals
  if (q === "out" || q === "empty" || q === "0" || q === "zero") return "out";

  // LOW signals
  if (q === "low" || q === "soon" || q === "1" || q === "2") return "low";

  return "other";
}

function QtyPill({ qty }: { qty: string }) {
  const level = getQtyLevel(qty);

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    letterSpacing: 0.2,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };

  if (level === "out") {
    return (
      <span
        style={{
          ...base,
          background: "#ffe8e8",
          borderColor: "#ffb3b3",
          color: "#8a0f0f",
        }}
        title="Out / Empty"
      >
        OUT
      </span>
    );
  }

  if (level === "low") {
    return (
      <span
        style={{
          ...base,
          background: "#fff5db",
          borderColor: "#ffd27a",
          color: "#7a5200",
        }}
        title="Low"
      >
        LOW
      </span>
    );
  }

  // Default: show raw qty as-is, neutral styling
  return (
    <span
      style={{
        ...base,
        background: "#f3f4f6",
        borderColor: "#e5e7eb",
        color: "#111827",
        fontWeight: 700,
      }}
      title="Quantity / status"
    >
      {qty || "—"}
    </span>
  );
}

export default async function ManagerPage() {
  const rows = await getTodayAlerts(); // returns raw rows for today

  // ✅ Sort newest first (robust: uses Date.parse so it works even if formats change)
  const sortedRows = [...rows].sort((a, b) => {
    const ta = Date.parse(a.timestamp || "") || 0;
    const tb = Date.parse(b.timestamp || "") || 0;
    return tb - ta;
  });

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

      <p style={{ opacity: 0.8 }}>All alerts logged today (newest first).</p>

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
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 12, opacity: 0.8 }}>
                  No alerts yet today.
                </td>
              </tr>
            ) : (
              sortedRows.map((r, idx) => (
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

                  {/* ✅ Qty highlighted */}
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    <QtyPill qty={r.qty} />
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
