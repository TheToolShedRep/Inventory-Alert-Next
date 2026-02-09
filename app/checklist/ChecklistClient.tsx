"use client";

import { useMemo, useState } from "react";

type ChecklistItem = {
  timestamp: string;
  item: string;
  qty: string; // "low" | "empty"
  location: string;
  note: string;
  alertId: string; // IMPORTANT: used to cancel/resolve
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

/**
 * Cancel = "this was a mistake / undo"
 * (You already use this elsewhere; keeping it here for parity.)
 */
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

/**
 * Resolve = "we handled it / restocked / done"
 * ✅ This is what Checklist “Resolved” should call.
 */
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

export default function ChecklistClient({
  initialItems,
}: {
  initialItems: ChecklistItem[];
}) {
  const [items, setItems] = useState<ChecklistItem[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  const hasItems = useMemo(() => items.length > 0, [items.length]);

  const resolve = async (alertId: string) => {
    setBusyId(alertId);

    // Optimistic remove (feels instant)
    const prev = items;
    setItems((cur) => cur.filter((x) => x.alertId !== alertId));

    try {
      // ✅ FIX: call resolve endpoint (not cancel)
      await resolveAlert(alertId);
    } catch (e) {
      // rollback if resolve fails
      setItems(prev);
      alert("Could not mark resolved. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  // Minimal swipe-to-resolve:
  // If user swipes left more than ~80px, we mark resolved.
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

        const delta = startX - currentX; // swipe left = positive
        if (delta > 80) {
          await resolve(alertId);
        }
      },
    };
  };

  return (
    <>
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
                  touchAction: "pan-y", // allows vertical scroll but still lets us detect horizontal swipe
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

                  {/* Last reported at */}
                  <div style={{ opacity: 0.75, fontSize: 13 }}>
                    Last reported: {it.timestamp}
                  </div>

                  {it.note ? (
                    <div style={{ marginTop: 2, opacity: 0.85, fontSize: 13 }}>
                      Note: {it.note}
                    </div>
                  ) : null}
                </div>

                {/* Tap fallback (desktop + accessibility) */}
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
