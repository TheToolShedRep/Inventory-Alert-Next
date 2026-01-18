"use client";

import { useState } from "react";

export default function PurchaseForm({
  lookup,
  onBack,
  onSubmit,
  defaultStoreVendor,
  defaultLocation,
}: {
  lookup: {
    upc: string;
    name: string;
    brand?: string;
    sizeUnit?: string;
    googleCategoryId?: string;
    googleCategoryName?: string;
  };
  onBack: () => void;
  onSubmit: (body: {
    productName: string;
    brand?: string;
    sizeUnit?: string;
    googleCategoryId?: string;
    googleCategoryName?: string;
    qtyPurchased: number;
    totalPrice: number;
    storeVendor: string;
    assignedLocation: "Kitchen" | "Front";
    notes?: string;
  }) => Promise<void>;
  defaultStoreVendor: string;
  defaultLocation: "Kitchen" | "Front";
}) {
  const [qty, setQty] = useState<number>(1);
  const [price, setPrice] = useState<string>("");
  const [vendor, setVendor] = useState<string>(defaultStoreVendor || "");
  const [loc, setLoc] = useState<"Kitchen" | "Front">(
    defaultLocation || "Kitchen"
  );
  const [notes, setNotes] = useState<string>("");

  const submit = async () => {
    const totalPrice = Number(price);
    if (!Number.isFinite(totalPrice) || totalPrice < 0)
      return alert("Enter a valid total price");
    if (!vendor.trim()) return alert("Enter store/vendor");

    await onSubmit({
      productName: lookup.name,
      brand: lookup.brand,
      sizeUnit: lookup.sizeUnit,
      googleCategoryId: lookup.googleCategoryId,
      googleCategoryName: lookup.googleCategoryName,
      qtyPurchased: qty,
      totalPrice,
      storeVendor: vendor.trim(),
      assignedLocation: loc,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div>
        <div className="text-sm text-neutral-500">Confirm purchase</div>
        <div className="text-lg font-semibold">{lookup.name}</div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Quantity</label>
        <div className="flex items-center gap-2">
          <button
            className="h-10 w-10 rounded-lg border text-lg"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            −
          </button>
          <div className="min-w-[48px] text-center text-lg font-semibold">
            {qty}
          </div>
          <button
            className="h-10 w-10 rounded-lg border text-lg"
            onClick={() => setQty((q) => q + 1)}
          >
            +
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Total Price ($)</label>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="12.99"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Store / Vendor</label>
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Costco"
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Location</label>
        <div className="flex gap-2">
          <button
            onClick={() => setLoc("Kitchen")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              loc === "Kitchen" ? "bg-black text-white" : ""
            }`}
          >
            Kitchen
          </button>
          <button
            onClick={() => setLoc("Front")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              loc === "Front" ? "bg-black text-white" : ""
            }`}
          >
            Front
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          rows={3}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onBack}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Back
        </button>
        <button
          onClick={submit}
          className="flex-1 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Save Purchase
        </button>
      </div>
    </div>
  );
}
