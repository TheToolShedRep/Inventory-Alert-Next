"use client";

import { useMemo, useRef, useState } from "react";

type ChecklistItem = {
  timestamp: string;
  item: string;
  qty: string; // "low" | "empty"
  location: string;
  note: string;
  alertId: string; // IMPORTANT: used to cancel/resolve
};

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
      }}
    >
      {qty || "—"}
    </span>
  );
}

async function cancelAlert(alertId: string) {
  const res = await fetch("/api/alert/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alertId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Cancel failed");
  }
}

async function resolveAlert(alertId: string) {
  const res = await fetch("/api/alert/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alertId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Resolve failed");
  }
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

export default function ChecklistClient({
  initialItems,
}: {
  initialItems: ChecklistItem[];
}) {
  /**
   * ============================
   * Auto Reorder (Shopping List)
   * ============================
   */
  const [shoppingLoading, setShoppingLoading] = useState(true);
  const [shopping, setShopping] = useState<ShoppingRow[]>([]);
  const [shoppingError, setShoppingError] = useState<string>("");

  const undoTimerRef = useRef<any>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoUpc, setUndoUpc] = useState<string>("");
  const [undoLabel, setUndoLabel] = useState<string>("");

  useMemo(() => {
    (async () => {
      try {
        setShoppingLoading(true);
        setShoppingError("");
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

    const prev = shopping;
    setShopping((cur) => cur.filter((r) => String(r.upc || "").trim() !== upc));

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoUpc(upc);
    setUndoLabel(row.product_name || upc);
    setUndoVisible(true);

    try {
      await postShoppingAction({ upc, action: "dismissed" });
    } catch {
      setShopping(prev);
      setUndoVisible(false);
      alert("Dismiss failed. Try again.");
      return;
    }

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
    } catch {
      alert("Undo failed. Try again.");
      return;
    }

    try {
      setShoppingLoading(true);
      const res = await fetch("/api/shopping-list", { cache: "no-store" });
      const data = await res.json();
      const rows = (data?.rows || data?.shoppingList || []) as ShoppingRow[];
      setShopping(rows);
    } finally {
      setShoppingLoading(false);
      setUndoVisible(false);
      setUndoUpc("");
      setUndoLabel("");
    }
  };

  /**
   * ============================
   * Checklist Alerts
   * ============================
   */
  const [items, setItems] = useState<ChecklistItem[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasItems = useMemo(() => items.length > 0, [items.length]);

  const resolve = async (alertId: string) => {
    setBusyId(alertId);

    const prev = items;
    setItems((cur) => cur.filter((x) => x.alertId !== alertId));

    try {
      await resolveAlert(alertId);
    } catch {
      setItems(prev);
      alert("Could not mark resolved. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  const attachSwipe = (alertId: string) => {
    let startX = 0;
    let currentX = 0;
    let tracking = false;

    return {
      onTouchStart: (e: React.TouchEvent) => {
        tracking = true;
        startX = e.touches[0].clientX;
        currentX = startX;
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!tracking) return;
        currentX = e.touches[0].clientX;
      },
      onTouchEnd: async () => {
        if (!tracking) return;
        tracking = false;

        const delta = startX - currentX;
        if (delta > 80) {
          await resolve(alertId);
        }
      },
    };
  };

  return (
    <>
      {/* ============================
          Auto Reorder Section
         ============================ */}
      <section
        style={{
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 12,
          overflow: "hidden",
          marginTop: 16,
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
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {shopping.map((r, idx) => {
              const upc = String(r.upc || idx);
              return (
                <li
                  key={upc}
                  style={{
                    padding: 12,
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {r.product_name || r.upc}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {r.qty_to_order_base_units ?? ""} {r.base_unit || ""}{" "}
                      {r.preferred_vendor ? `• ${r.preferred_vendor}` : ""}
                    </div>
                  </div>

                  <button
                    onClick={() => dismiss(r)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      fontWeight: 900,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title="Hide this item for today"
                  >
                    Dismiss
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {undoVisible ? (
        <div
          style={{
            marginTop: 10,
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
          Checklist Alerts Section
         ============================ */}
      {!hasItems ? (
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
          {items.map((it) => {
            const swipeHandlers = attachSwipe(it.alertId);

            return (
              <li
                key={`${it.item}|${it.location}`}
                {...swipeHandlers}
                style={{
                  padding: 14,
                  border: "1px solid #eee",
                  borderRadius: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  touchAction: "pan-y",
                }}
                title="Swipe left to resolve"
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                  >
                    <div style={{ fontWeight: 800 }}>{it.item}</div>
                    <StatusPill qty={it.qty} />
                  </div>

                  <div style={{ opacity: 0.75 }}>{it.location}</div>

                  <div style={{ opacity: 0.75, fontSize: 13 }}>
                    Last reported: {it.timestamp}
                  </div>

                  {it.note ? (
                    <div style={{ marginTop: 2, opacity: 0.85, fontSize: 13 }}>
                      Note: {it.note}
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={() => resolve(it.alertId)}
                  disabled={busyId === it.alertId}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: busyId === it.alertId ? "#f3f4f6" : "#fff",
                    fontWeight: 800,
                    cursor: busyId === it.alertId ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {busyId === it.alertId ? "…" : "Resolved"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p style={{ marginTop: 12, opacity: 0.7, fontSize: 13 }}>
        Tip: Swipe left on mobile to mark resolved, or tap “Resolved”.
      </p>
    </>
  );
}
