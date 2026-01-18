"use client";

import { useEffect } from "react";

export default function Success({
  productName,
  onScanNext,
  onDone,
}: {
  productName: string;
  onScanNext: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => {
      onScanNext();
    }, 1200);

    return () => clearTimeout(t);
  }, [onScanNext]);

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="text-lg font-semibold">✓ Saved</div>
      <div className="text-sm text-neutral-700">{productName} added.</div>

      <div className="flex gap-2">
        <button
          onClick={onScanNext}
          className="flex-1 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Scan next item
        </button>
        <button
          onClick={onDone}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Done
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Tip: vendor + location will stay prefilled while you keep scanning.
      </p>
    </div>
  );
}
