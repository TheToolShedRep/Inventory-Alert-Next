// app/manager/shopping/ManagerShoppingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ShoppingRow = {
  timestamp?: string;
  upc?: string;
  product_name?: string;
  qty_to_order_base_units?: any;
  reorder_point?: any;
  note?: string;
};

function norm(v: any) {
  return String(v ?? "").trim();
}

export default function ManagerShoppingClient() {
  const [rows, setRows] = useState<ShoppingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUpc, setBusyUpc] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [showHidden, setShowHidden] = useState(false); // ✅ NEW

  async function refresh(nextShowHidden?: boolean) {
    setError("");
    setLoading(true);

    const useHidden =
      typeof nextShowHidden === "boolean" ? nextShowHidden : showHidden;

    try {
      const res = await fetch(
        `/api/shopping-list?includeHidden=${useHidden ? "1" : "0"}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data = await res.json();
      if (!res.ok || !data?.ok)
        throw new Error(data?.error || "Failed to load shopping list");

      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function act(
    upcRaw: string,
    action: "dismissed" | "purchased" | "undo",
  ) {
    const upc = norm(upcRaw).toUpperCase();
    if (!upc) return;

    setError("");
    setBusyUpc(upc);

    try {
      const res = await fetch("/api/shopping/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upc, action }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Action failed");

      // ✅ If you just hid something and you're not showing hidden, it will disappear.
      // That's correct. But refresh either way.
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Action failed");
    } finally {
      setBusyUpc(null);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const qa =
        Number(
          String(a.qty_to_order_base_units ?? "0").replace(/[^0-9.-]/g, ""),
        ) || 0;
      const qb =
        Number(
          String(b.qty_to_order_base_units ?? "0").replace(/[^0-9.-]/g, ""),
        ) || 0;
      return qb - qa;
    });
  }, [rows]);

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>Manager Shopping List</h1>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <button
          onClick={() => refresh()}
          disabled={loading}
          style={{ padding: "8px 12px" }}
        >
          Refresh
        </button>

        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => {
              const next = e.target.checked;
              setShowHidden(next);
              refresh(next); // ✅ reload with includeHidden=1 immediately
            }}
          />
          Show hidden (for Undo)
        </label>

        {loading ? <span>Loading…</span> : <span>{sorted.length} items</span>}
      </div>

      {error ? (
        <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {sorted.map((r) => {
          const upc = norm(r.upc).toUpperCase();
          const name = norm(r.product_name) || upc || "(missing upc)";
          const qty = norm(r.qty_to_order_base_units);
          const rp = norm(r.reorder_point);

          const disabled = !upc || busyUpc === upc;

          return (
            <div
              key={`${upc}-${r.timestamp ?? ""}`}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
                display: "grid",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 900 }}>{name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    UPC: {upc || "—"} • Reorder point: {rp || "—"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Qty to order
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {qty || "0"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => act(upc, "dismissed")}
                  disabled={disabled}
                  style={{ padding: "8px 12px" }}
                >
                  {busyUpc === upc ? "…" : "Dismiss"}
                </button>

                <button
                  onClick={() => act(upc, "purchased")}
                  disabled={disabled}
                  style={{ padding: "8px 12px" }}
                >
                  {busyUpc === upc ? "…" : "Purchased"}
                </button>

                <button
                  onClick={() => act(upc, "undo")}
                  disabled={disabled}
                  style={{ padding: "8px 12px" }}
                >
                  {busyUpc === upc ? "…" : "Undo"}
                </button>
              </div>

              {r.note ? (
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Note: {norm(r.note)}
                </div>
              ) : null}
            </div>
          );
        })}

        {!loading && sorted.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            No items right now.
            {!showHidden
              ? " (Turn on “Show hidden” to undo purchased/dismissed items.)"
              : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
