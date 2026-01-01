"use client";

import { useMemo, useState } from "react";
import type { AlertRow } from "@/lib/sheets";

type SortKey =
  | "timestamp"
  | "item"
  | "qty"
  | "location"
  | "note"
  | "ip"
  | "userAgent";

function StatusPill({ qty }: { qty: string }) {
  const q = (qty || "").trim().toLowerCase();

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: 999,
    fontWeight: 800,
    letterSpacing: 0.4,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
  };

  if (q === "empty") {
    return (
      <span
        style={{
          ...base,
          background: "#ffe8e8",
          borderColor: "#ffb3b3",
          color: "#8a0f0f",
        }}
      >
        EMPTY
      </span>
    );
  }

  if (q === "low") {
    return (
      <span
        style={{
          ...base,
          background: "#fff5db",
          borderColor: "#ffd27a",
          color: "#7a5200",
        }}
      >
        LOW
      </span>
    );
  }

  return (
    <span
      style={{
        ...base,
        background: "#f3f4f6",
        borderColor: "#e5e7eb",
        color: "#111827",
        fontWeight: 700,
      }}
    >
      {qty || "—"}
    </span>
  );
}

function StatusBadge({ status }: { status: AlertRow["status"] }) {
  const s = (status || "").toLowerCase();

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 800,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    fontSize: 12,
  };

  if (s === "resolved") {
    return (
      <span
        style={{
          ...base,
          background: "#e8f6ff",
          borderColor: "#9fd6ff",
          color: "#0b4a6f",
        }}
      >
        RESOLVED
      </span>
    );
  }

  if (s === "canceled") {
    return (
      <span
        style={{
          ...base,
          background: "#f3f4f6",
          borderColor: "#e5e7eb",
          color: "#374151",
        }}
      >
        CANCELED
      </span>
    );
  }

  return (
    <span
      style={{
        ...base,
        background: "#eaffef",
        borderColor: "#a7f3b7",
        color: "#0f4d24",
      }}
    >
      ACTIVE
    </span>
  );
}

function compare(a: any, b: any) {
  const av = (a ?? "").toString().toLowerCase();
  const bv = (b ?? "").toString().toLowerCase();
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

export default function ManagerClient({ rows }: { rows: AlertRow[] }) {
  // default: newest first
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    const copy = [...rows];

    copy.sort((ra, rb) => {
      if (sortKey === "timestamp") {
        const ta = Date.parse(ra.timestamp || "") || 0;
        const tb = Date.parse(rb.timestamp || "") || 0;
        return dir === "asc" ? ta - tb : tb - ta;
      }

      const res = compare((ra as any)[sortKey], (rb as any)[sortKey]);
      return dir === "asc" ? res : -res;
    });

    return copy;
  }, [rows, sortKey, dir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);

    // sensible defaults: timestamp desc, everything else asc
    setDir(key === "timestamp" ? "desc" : "asc");
  };

  const Th = ({ label, keyName }: { label: string; keyName: SortKey }) => (
    <th
      onClick={() => toggleSort(keyName)}
      style={{
        textAlign: "left",
        padding: 12,
        borderBottom: "1px solid #eee",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      title="Click to sort"
    >
      {label} {sortKey === keyName ? (dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );

  return (
    <div
      style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 12 }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <Th label="Timestamp" keyName="timestamp" />
            <Th label="Item" keyName="item" />
            <th
              style={{
                textAlign: "left",
                padding: 12,
                borderBottom: "1px solid #eee",
              }}
            >
              Status
            </th>
            <Th label="Location" keyName="location" />
            <Th label="Note" keyName="note" />
            <Th label="IP" keyName="ip" />
            <Th label="User Agent" keyName="userAgent" />
            <th
              style={{
                textAlign: "left",
                padding: 12,
                borderBottom: "1px solid #eee",
              }}
            >
              State
            </th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: 12, opacity: 0.8 }}>
                No alerts yet today.
              </td>
            </tr>
          ) : (
            sortedRows.map((r, idx) => (
              <tr key={idx}>
                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f2f2f2",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.timestamp}
                </td>
                <td
                  style={{
                    padding: 12,
                    borderBottom: "1px solid #f2f2f2",
                    fontWeight: 700,
                  }}
                >
                  {r.item}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}>
                  <StatusPill qty={r.qty} />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}>
                  {r.location}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}>
                  {r.note || ""}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}>
                  {r.ip || ""}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}>
                  {r.userAgent || ""}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ padding: 10, opacity: 0.7, fontSize: 13 }}>
        Tip: click a column header to sort. Click again to reverse.
      </div>
    </div>
  );
}
