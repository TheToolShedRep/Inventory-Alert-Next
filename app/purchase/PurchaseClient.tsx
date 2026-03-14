"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function PurchaseClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const upc = searchParams.get("upc");
  const productName = searchParams.get("product_name") || "";
  const recommendedQty = searchParams.get("recommended_qty") || "";
  const vendor = searchParams.get("vendor") || "";
  const location = searchParams.get("location") || "";
  const returnUrl = searchParams.get("return") || "/checklist";

  const [mode, setMode] = useState<"add" | "set">("add");
  const [quantity, setQuantity] = useState(recommendedQty);
  const [note, setNote] = useState("");
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
          product_name: productName,
          vendor,
          location,
          action: "purchased",
          mode,
          quantity,
          note,
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
        <h2 style={{ margin: 0, marginBottom: 12 }}>
          {mode === "set" ? "Set Current Inventory" : "Restock Item"}
        </h2>

        <p style={{ marginTop: 0, opacity: 0.75 }}>
          {mode === "set"
            ? "Enter the actual current inventory count for this item."
            : "Confirm that this item was purchased or restocked."}
        </p>

        <div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
            Product Name
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Recommended Restock: {recommendedQty || "—"}
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
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              Inventory Update Mode
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="purchase_mode"
                  value="add"
                  checked={mode === "add"}
                  onChange={() => setMode("add")}
                />
                Add purchased quantity
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="purchase_mode"
                  value="set"
                  checked={mode === "set"}
                  onChange={() => setMode("set")}
                />
                Set current inventory
              </label>
            </div>
          </div>

          <div>
            <label
              htmlFor="quantity"
              style={{
                display: "block",
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 4,
              }}
            >
              {mode === "add" ? "Quantity Added" : "Set Current Inventory To"}
            </label>
            <input
              id="quantity"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter amount added"
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 10,
                background: "#fff",
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              Preferred Vendor
            </div>
            <div
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#f9fafb",
              }}
            >
              {vendor || "—"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
              Default Location
            </div>
            <div
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                background: "#f9fafb",
              }}
            >
              {location || "—"}
            </div>
          </div>

          <div>
            <label
              htmlFor="note"
              style={{
                display: "block",
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 4,
              }}
            >
              Note (optional)
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Vendor, purchase note, or restock detail"
              rows={4}
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid #d1d5db",
                borderRadius: 10,
                background: "#fff",
                resize: "vertical",
              }}
            />
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
            {loading
              ? "Processing..."
              : mode === "set"
                ? "Save Inventory Count"
                : "Confirm Restock"}
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
