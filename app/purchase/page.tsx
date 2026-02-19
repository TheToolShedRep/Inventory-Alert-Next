// app/purchase/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type CatalogDefaults = {
  productName?: string;
  defaultLocation?: "Kitchen" | "Front";
  preferredVendor?: string;
};

function todayNY(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const yyyy = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${yyyy}-${mm}-${dd}`;
}

export default function PurchasePage() {
  const router = useRouter();
  const params = useSearchParams();

  const upc = (params.get("upc") || "").trim();
  const returnTo = (params.get("return") || "/manager").trim();

  const [loading, setLoading] = useState(true);

  // Prefilled defaults from Catalog
  const [productName, setProductName] = useState("");
  const [storeVendor, setStoreVendor] = useState("");
  const [assignedLocation, setAssignedLocation] = useState<"Kitchen" | "Front">(
    "Kitchen",
  );

  // Required input
  const [qtyPurchased, setQtyPurchased] = useState<number>(1);

  const date = useMemo(() => todayNY(), []);

  useEffect(() => {
    (async () => {
      if (!upc) return;

      try {
        const res = await fetch(
          `/api/catalog-lookup?upc=${encodeURIComponent(upc)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        const defaults: CatalogDefaults | null = data?.defaults ?? null;

        // Product name
        setProductName(defaults?.productName?.trim() || upc);

        // Vendor
        if (defaults?.preferredVendor) {
          setStoreVendor(defaults.preferredVendor);
        }

        // Location
        if (
          defaults?.defaultLocation === "Kitchen" ||
          defaults?.defaultLocation === "Front"
        ) {
          setAssignedLocation(defaults.defaultLocation);
        }
      } catch {
        setProductName(upc);
      } finally {
        setLoading(false);
      }
    })();
  }, [upc]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!upc) return;

    // Align with /api/purchase validation rules
    if (!productName.trim()) {
      alert("Product name is required.");
      return;
    }

    if (!Number.isFinite(qtyPurchased) || qtyPurchased <= 0) {
      alert("Qty Purchased must be > 0.");
      return;
    }

    if (!storeVendor.trim()) {
      alert("Vendor / Store is required.");
      return;
    }

    // 1️⃣ Write to Purchases sheet
    const purchaseRes = await fetch("/api/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upc,
        productName: productName.trim(),
        qtyPurchased,
        totalPrice: 0, // optional for now
        storeVendor: storeVendor.trim(),
        assignedLocation,
      }),
    });

    const purchaseData = await purchaseRes.json();
    if (!purchaseData?.ok) {
      alert(purchaseData?.error || "Purchase failed");
      return;
    }

    // 2️⃣ Mark shopping item as purchased (instant hide)
    await fetch("/api/shopping/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        upc,
        action: "purchased",
        note: "",
      }),
    });

    router.push(returnTo);
    router.refresh();
  }

  if (!upc) return <div className="p-6">Missing UPC.</div>;
  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold mb-4">Log Purchase</h1>

      <div className="mb-4 p-3 rounded border bg-white">
        <div className="font-medium">{productName}</div>
        <div className="text-sm opacity-70">{upc}</div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Product Name *</label>
          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full border rounded p-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Qty Purchased *</label>
          <input
            type="number"
            min={1}
            step={1}
            value={qtyPurchased}
            onChange={(e) => setQtyPurchased(Number(e.target.value))}
            className="w-full border rounded p-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Vendor / Store *</label>
          <input
            value={storeVendor}
            onChange={(e) => setStoreVendor(e.target.value)}
            className="w-full border rounded p-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Location *</label>
          <select
            value={assignedLocation}
            onChange={(e) =>
              setAssignedLocation(e.target.value as "Kitchen" | "Front")
            }
            className="w-full border rounded p-2"
            required
          >
            <option value="Kitchen">Kitchen</option>
            <option value="Front">Front</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full border rounded p-2 font-medium bg-black text-white"
        >
          Save Purchase
        </button>
      </form>
    </div>
  );
}
