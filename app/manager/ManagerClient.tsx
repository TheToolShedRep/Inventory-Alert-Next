"use client";

import { useMemo, useRef, useState } from "react";
import type { AlertRow } from "@/lib/sheets-core";

/**
 * This client now renders:
 * 1) Auto Reorder (Shopping List) with Dismiss + Undo
 * 2) Existing Manager alerts table
 *
 * Why client-side list?
 * - We want instant UI updates without waiting for a server refresh.
 */

type SortKey =
  | "timestamp"
  | "item"
  | "qty"
  | "location"
  | "note"
  | "ip"
  | "userAgent";

type ShoppingRow = {
  upc?: string;
  product_name?: string;
  on_hand_base_units?: any;
  qty_to_order_base_units?: any;
  base_unit?: string;
  preferred_vendor?: string;
  default_location?: string;
};

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

async function postShoppingAction(input: {
  upc: string;
  action: "dismissed" | "undo" | "purchased";
  note?: string;
}) {
  const res = await fetch("/api/shopping/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "Shopping action failed");
  }
}

export default function ManagerClient({
  rows,
  // Optional: if later you choose to pass shoppingList from server into this client,
  // we can accept it here. For now we fetch client-side to keep things simple.
}: {
  rows: AlertRow[];
}) {
  /**
   * ============================
   * Auto Reorder (Shopping List)
   * ============================
   */
  const [shoppingLoading, setShoppingLoading] = useState(true);
  const [shopping, setShopping] = useState<ShoppingRow[]>([]);
  const [shoppingError, setShoppingError] = useState<string>("");

  // Undo UX state
  const undoTimerRef = useRef<any>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoUpc, setUndoUpc] = useState<string>("");
  const [undoLabel, setUndoLabel] = useState<string>("");

  // Fetch shopping list once on first render
  useMemo(() => {
    (async () => {
      try {
        setShoppingLoading(true);
        setShoppingError("");

        // Uses your existing route if present. If you don't have this route,
        // swap this to any endpoint that returns Shopping_List rows.
        const res = await fetch("/api/shopping-list", { cache: "no-store" });
        const data = await res.json();

        const rows = (data?.rows || data?.shoppingList || []) as ShoppingRow[];
        setShopping(rows);
      } catch (e: any) {
        setShoppingError(e?.message || "Could not load shopping list");
      } finally {
        setShoppingLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = async (row: ShoppingRow) => {
    const upc = String(row.upc || "").trim();
    if (!upc) return;

    // Optimistic remove
    const prev = shopping;
    setShopping((cur) => cur.filter((r) => String(r.upc || "").trim() !== upc));

    // Prepare undo bar
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoUpc(upc);
    setUndoLabel(row.product_name || upc);
    setUndoVisible(true);

    // Fire action
    try {
      await postShoppingAction({ upc, action: "dismissed" });
    } catch (e) {
      // rollback on failure
      setShopping(prev);
      setUndoVisible(false);
      alert("Dismiss failed. Try again.");
      return;
    }

    // Auto-hide undo after 8s
    undoTimerRef.current = setTimeout(() => {
      setUndoVisible(false);
      setUndoUpc("");
      setUndoLabel("");
    }, 8000);
  };

  const undo = async () => {
    const upc = undoUpc;
    if (!upc) return;

    try {
      await postShoppingAction({ upc, action: "undo" });
    } catch (e) {
      alert("Undo failed. Try again.");
      return;
    }

    // After undo, we should re-fetch list to restore correct ordering/filters.
    // (Because the server is the source of truth.)
    try {
      setShoppingLoading(true);
      const res = await fetch("/api/shopping-list", { cache: "no-store" });
      const data = await res.json();
      const rows = (data?.rows || data?.shoppingList || []) as ShoppingRow[];
      setShopping(rows);
    } catch {
      // If refetch fails, at least hide the undo bar.
    } finally {
      setShoppingLoading(false);
      setUndoVisible(false);
      setUndoUpc("");
      setUndoLabel("");
    }
  };

  /**
   * ============================
   * Existing Alerts table sorting
   * ============================
   */
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
    <div style={{ display: "grid", gap: 16 }}>
      {/* ============================
          Auto Reorder Section (Client)
         ============================ */}
      <section
        style={{
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            fontWeight: 800,
            background: "rgba(0,0,0,0.03)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>Auto Reorder (Shopping List)</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {shoppingLoading ? "Loading…" : `${shopping.length} items`}
          </div>
        </div>

        {shoppingError ? (
          <div style={{ padding: 12, color: "#8a0f0f" }}>{shoppingError}</div>
        ) : shoppingLoading ? (
          <div style={{ padding: 12, opacity: 0.8 }}>Loading…</div>
        ) : shopping.length === 0 ? (
          <div style={{ padding: 12, opacity: 0.75 }}>
            No items currently flagged for reorder.
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 140px 1fr 120px",
                padding: "10px 12px",
                fontWeight: 700,
                background: "rgba(0,0,0,0.02)",
              }}
            >
              <div>Item</div>
              <div>On hand</div>
              <div>Order qty</div>
              <div>Vendor</div>
              <div />
            </div>

            {shopping.map((r, idx) => {
              const upc = String(r.upc || idx);
              return (
                <div
                  key={upc}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 140px 1fr 120px",
                    padding: "10px 12px",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {r.product_name || r.upc}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {r.upc}{" "}
                      {r.default_location ? `• ${r.default_location}` : ""}
                    </div>
                  </div>

                  <div>
                    {r.on_hand_base_units ?? ""}{" "}
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      {r.base_unit || ""}
                    </span>
                  </div>

                  <div>
                    {r.qty_to_order_base_units ?? ""}{" "}
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      {r.base_unit || ""}
                    </span>
                  </div>

                  <div>{r.preferred_vendor || "—"}</div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => dismiss(r)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                      title="Hide this item for today"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </section>

      {/* Undo bar */}
      {undoVisible ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 700 }}>
            Dismissed:{" "}
            <span style={{ fontWeight: 800 }}>{undoLabel || undoUpc}</span>
          </div>
          <button
            onClick={undo}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Undo
          </button>
        </div>
      ) : null}

      {/* ============================
          Existing Alerts Table
         ============================ */}
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
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
                    <StatusPill qty={r.qty} />
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
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #f2f2f2" }}
                  >
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
    </div>
  );
}
