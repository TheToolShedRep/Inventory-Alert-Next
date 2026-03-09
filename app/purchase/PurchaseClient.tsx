// app/purchase/PurchaseClient.tsx

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

      // Return to checklist
      router.push(returnUrl);
    } catch (err) {
      alert("Error marking item as purchased");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Restock Item</h2>

      <p>
        <strong>UPC:</strong> {upc}
      </p>

      <button
        onClick={markPurchased}
        disabled={loading}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "#111",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        {loading ? "Processing..." : "Confirm Restock"}
      </button>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => router.push(returnUrl)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
