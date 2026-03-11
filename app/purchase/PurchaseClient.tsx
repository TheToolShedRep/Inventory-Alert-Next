"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function PurchaseClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const upc = searchParams.get("upc");
  const returnUrl = searchParams.get("return") || "/checklist";

  const [loading, setLoading] = useState(false);

  async function markPurchased() {
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
          action: "purchased",
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Purchase failed");
        return;
      }

      router.push(returnUrl);
    } catch (err) {
      alert("Error marking item as purchased");
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
        <h2 style={{ margin: 0, marginBottom: 12 }}>Restock Item</h2>

        <p style={{ marginTop: 0, opacity: 0.75 }}>
          Confirm that this item was purchased or restocked.
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
            onClick={markPurchased}
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
            {loading ? "Processing..." : "Confirm Restock"}
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
