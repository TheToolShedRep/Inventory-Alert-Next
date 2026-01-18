"use client";

type ConfirmProductProps = {
  lookup: any | null;
  upc: string;
  onBack: () => void;
  onRescan: () => void;
  onConfirm: () => void;

  // ✅ Manual-entry support (optional props so existing usage still works)
  needsManualEntry?: boolean;
  manualName?: string;
  manualBrand?: string;
  onManualNameChange?: (v: string) => void;
  onManualBrandChange?: (v: string) => void;
};

export default function ConfirmProduct({
  lookup,
  upc,
  onBack,
  onRescan,
  onConfirm,
  needsManualEntry = false,
  manualName = "",
  manualBrand = "",
  onManualNameChange,
  onManualBrandChange,
}: ConfirmProductProps) {
  const isLoading = !lookup && !needsManualEntry;
  const name =
    lookup?.name || (isLoading ? "Looking up item…" : "Unknown Item");
  const brand = lookup?.brand || "";
  const size = lookup?.sizeUnit || "";
  const cat = lookup?.googleCategoryName || "Unknown";

  // ✅ Confirm button rules:
  // - normal path: require lookup.ok (same as before)
  // - manual path: require a non-empty manualName
  const canConfirm = needsManualEntry
    ? manualName.trim().length > 0
    : Boolean(lookup?.ok);

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="text-sm text-neutral-500">UPC: {upc}</div>

      {/* If we're in manual mode, show a clear header */}
      {needsManualEntry ? (
        <>
          <div className="text-lg font-semibold">UPC not found</div>
          <div className="text-sm text-neutral-600">
            Enter a product name (required) and brand (optional), then confirm.
          </div>

          <div className="space-y-2 pt-1">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Product name <span className="text-red-600">*</span>
              </label>
              <input
                value={manualName}
                onChange={(e) => onManualNameChange?.(e.target.value)}
                placeholder="e.g., Bottled Water"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Brand</label>
              <input
                value={manualBrand}
                onChange={(e) => onManualBrandChange?.(e.target.value)}
                placeholder="e.g., Dasani"
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Normal “found item” UI */}
          <div className="text-lg font-semibold">{name}</div>
          {brand ? <div className="text-sm">Brand: {brand}</div> : null}
          {size ? <div className="text-sm">Size: {size}</div> : null}
          {cat ? <div className="text-sm">Category: {cat}</div> : null}
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={onBack}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Back
        </button>
        <button
          onClick={onRescan}
          className="rounded-lg border px-4 py-2 text-sm"
        >
          Rescan
        </button>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          className="flex-1 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
