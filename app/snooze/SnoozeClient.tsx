"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SnoozeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const upc = searchParams.get("upc") || "";
  const productName = searchParams.get("product_name") || "";
  const returnUrl = searchParams.get("return") || "/checklist";

  const [loading, setLoading] = useState(false);
  const [choice, setChoice] = useState("tomorrow");

  async function confirmSnooze() {
    if (!upc) return;

    try {
      setLoading(true);

      const res = await fetch("/api/shopping/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          upc,
          product_name: productName,
          action: "snoozed",
          snooze_choice: choice,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Snooze failed");
        return;
      }

      router.push(returnUrl);
    } catch (err) {
      alert("Error saving snooze");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 20,
          background: "#fff",
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 12 }}>Snooze Item</h2>

        <p style={{ marginTop: 0, opacity: 0.75 }}>
          Temporarily hide this item from the active shopping list.
        </p>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 20,
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              Product Name
            </div>
            <div
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#f9fafb",
                fontWeight: 700,
              }}
            >
              {productName || "Unknown Product"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              UPC / Item Key
            </div>
            <div
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#f9fafb",
                fontWeight: 700,
              }}
            >
              {upc || "Missing UPC"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              Snooze Until
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="snooze_choice"
                  value="later_today"
                  checked={choice === "later_today"}
                  onChange={(e) => setChoice(e.target.value)}
                />
                Later today
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="snooze_choice"
                  value="tomorrow"
                  checked={choice === "tomorrow"}
                  onChange={(e) => setChoice(e.target.value)}
                />
                Tomorrow
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="snooze_choice"
                  value="two_days"
                  checked={choice === "two_days"}
                  onChange={(e) => setChoice(e.target.value)}
                />
                2 days
              </label>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              Return To
            </div>
            <div
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#f9fafb",
              }}
            >
              {returnUrl}
            </div>
          </div>
        </div>

        {!upc ? (
          <div
            style={{
              marginTop: 12,
              marginBottom: 16,
              color: "#8a0f0f",
              fontWeight: 700,
            }}
          >
            Missing UPC. Go back and choose an item from the checklist.
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 20,
          }}
        >
          <button
            onClick={confirmSnooze}
            disabled={loading || !upc}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: loading || !upc ? "#9ca3af" : "#111827",
              color: "#fff",
              cursor: loading || !upc ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Processing..." : "Confirm Snooze"}
          </button>

          <button
            onClick={() => router.push(returnUrl)}
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
