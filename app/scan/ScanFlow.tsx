"use client";

import { useCallback, useMemo, useState } from "react";
import ScanCamera from "./ScanCamera";
import ConfirmProduct from "./ConfirmProduct";
import PurchaseForm from "./PurchaseForm";
import Success from "./Success";

// --- Types ----------------------------------------------------

type Step = "scan" | "confirm" | "details" | "success";

type UpcLookupOk = {
  ok: true;
  upc: string;
  name: string;
  brand?: string;
  sizeUnit?: string;
  imageUrl?: string;
  googleCategoryId?: string;
  googleCategoryName?: string;
  issuingCountry?: string;
};

type UpcLookupErr = { ok: false; upc: string; error: string };

type CatalogDefaults = {
  defaultLocation?: "Kitchen" | "Front";
  preferredVendor?: string;
};

type PurchaseSubmitBody = {
  upc: string;
  productName: string;
  brand?: string;
  sizeUnit?: string;
  googleCategoryId?: string;
  googleCategoryName?: string;
  qtyPurchased: number;
  totalPrice: number; // NOTE: this is total price (qty * unit price). Your API now computes this from unit input.
  storeVendor: string;
  assignedLocation: "Kitchen" | "Front";
  notes?: string;
};

function digitsOnly(input: string) {
  return (input || "").replace(/\D/g, "");
}

// Build a "minimal lookup" object so the rest of the flow can proceed even if UPC lookup fails.
function makeManualLookup(upc: string): UpcLookupOk {
  return {
    ok: true,
    upc,
    name: "", // will be filled by manual entry
    brand: "",
    sizeUnit: undefined,
    imageUrl: undefined,
    googleCategoryId: undefined,
    googleCategoryName: undefined,
    issuingCountry: undefined,
  };
}

// --- Component ------------------------------------------------

export default function ScanFlow() {
  const [step, setStep] = useState<Step>("scan");

  const [scanUpc, setScanUpc] = useState<string>(""); // raw scanned digits
  const [lookup, setLookup] = useState<UpcLookupOk | null>(null);
  const [defaults, setDefaults] = useState<CatalogDefaults>({});
  const [error, setError] = useState<string>("");

  // ✅ Manual-entry mode state (when UPC not found)
  const [needsManualEntry, setNeedsManualEntry] = useState<boolean>(false);
  const [manualName, setManualName] = useState<string>("");
  const [manualBrand, setManualBrand] = useState<string>("");

  // “shopping mode” memory (used later)
  const [stickyVendor, setStickyVendor] = useState<string>("");
  const [stickyLocation, setStickyLocation] = useState<
    "Kitchen" | "Front" | ""
  >("");

  const resetToScan = useCallback(() => {
    setStep("scan");
    setScanUpc("");
    setLookup(null);
    setDefaults({});
    setError("");

    // reset manual-entry state
    setNeedsManualEntry(false);
    setManualName("");
    setManualBrand("");
  }, []);

  const goBack = useCallback(() => {
    setError("");
    setStep((s) => {
      if (s === "details") return "confirm";
      if (s === "confirm") return "scan";
      if (s === "success") return "details";
      return "scan";
    });
  }, []);

  // Step 2 will call this after scanning
  const handleScanned = useCallback(async (raw: string) => {
    const upc = digitsOnly(raw);
    if (!upc) return;

    setError("");
    setScanUpc(upc);

    // reset manual-entry state for new scan
    setNeedsManualEntry(false);
    setManualName("");
    setManualBrand("");

    // move forward immediately; show loader inside Confirm screen if you want
    setStep("confirm");

    try {
      // 1) UPC lookup
      const r = await fetch(`/api/upc-lookup?upc=${encodeURIComponent(upc)}`, {
        cache: "no-store",
      });

      // If the route ever fails to return JSON, this catch will handle it
      const data = (await r.json()) as UpcLookupOk | UpcLookupErr;

      // Treat "not found" the same as a lookup failure: allow manual entry
      const notFound =
        !r.ok ||
        (data as any)?.ok === false ||
        !(data as any)?.name ||
        (data as any)?.name === "Unknown Item";

      if (notFound) {
        // Allow manual entry, but keep the flow moving.
        setError(
          (data as any)?.error ||
            "UPC not found. Enter a product name and (optional) brand."
        );

        setNeedsManualEntry(true);
        setLookup(makeManualLookup(upc)); // minimal lookup so the rest of the flow can proceed
      } else {
        setLookup(data as UpcLookupOk);
      }

      // 2) Intelligent defaults (from Catalog)
      // Defaults should never block flow — if this fails, we still proceed.
      try {
        const d = await fetch(
          `/api/catalog-lookup?upc=${encodeURIComponent(upc)}`,
          {
            cache: "no-store",
          }
        );
        if (d.ok) {
          const cd = (await d.json()) as
            | { ok: true; defaults: CatalogDefaults }
            | { ok: false };
          if ("ok" in cd && cd.ok) {
            setDefaults(cd.defaults || {});
          }
        }
      } catch {
        // ignore — defaults are optional
      }
    } catch (e: any) {
      // If UPC lookup blows up unexpectedly, still allow manual entry so scanning isn't blocked.
      setError(
        e?.message || "Scan lookup failed. Enter a product name manually."
      );
      setNeedsManualEntry(true);
      setLookup(makeManualLookup(upc));
    }
  }, []);

  // Confirm step:
  // - If lookup succeeded normally, just go to details
  // - If manual-entry mode, require manualName and inject it into lookup
  const handleConfirm = useCallback(() => {
    if (!lookup) return;

    // If manual entry is required, ensure name is provided
    if (needsManualEntry) {
      const name = manualName.trim();
      const brand = manualBrand.trim();

      if (!name) {
        setError("Product name is required.");
        return;
      }

      // Replace lookup with a "real" lookup object using manual fields
      setLookup({
        ...lookup,
        ok: true,
        name,
        brand: brand || undefined,
      });
    }

    setError("");
    setStep("details");
  }, [lookup, needsManualEntry, manualName, manualBrand]);

  const handleSubmitPurchase = useCallback(
    async (body: Omit<PurchaseSubmitBody, "upc">) => {
      if (!lookup) return;

      setError("");

      const payload: PurchaseSubmitBody = {
        upc: lookup.upc,
        ...body,
      };

      try {
        const r = await fetch("/api/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await r.json().catch(() => ({}));
        if (!r.ok || data?.ok === false) {
          throw new Error(data?.error || `Purchase save failed (${r.status})`);
        }

        // shopping-mode “stickiness”
        setStickyVendor(payload.storeVendor);
        setStickyLocation(payload.assignedLocation);

        setStep("success");
      } catch (e: any) {
        setError(e?.message || "Save failed");
      }
    },
    [lookup]
  );

  // The PurchaseForm default values:
  const purchaseDefaults = useMemo(() => {
    const vendor = defaults.preferredVendor || stickyVendor || "";
    const loc =
      defaults.defaultLocation || (stickyLocation as any) || "Kitchen";
    return { vendor, loc };
  }, [defaults, stickyVendor, stickyLocation]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Shopping Scan</h1>
        <p className="text-sm text-neutral-600">
          Scan → confirm → enter price/location → save
        </p>
      </div>

      {/* Error banner */}
      {error ? (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {/* Step content */}
      {step === "scan" && <ScanCamera onDetected={handleScanned} />}

      {step === "confirm" && (
        <ConfirmProduct
          lookup={lookup}
          upc={scanUpc}
          onBack={goBack}
          onRescan={resetToScan}
          onConfirm={handleConfirm}
          // ✅ Manual-entry props (safe even if ConfirmProduct ignores them; add usage next)
          needsManualEntry={needsManualEntry}
          manualName={manualName}
          manualBrand={manualBrand}
          onManualNameChange={setManualName}
          onManualBrandChange={setManualBrand}
        />
      )}

      {step === "details" && lookup && (
        <PurchaseForm
          lookup={lookup}
          onBack={goBack}
          onSubmit={handleSubmitPurchase}
          defaultStoreVendor={purchaseDefaults.vendor}
          defaultLocation={purchaseDefaults.loc}
        />
      )}

      {step === "success" && lookup && (
        <Success
          productName={lookup.name}
          onScanNext={resetToScan}
          onDone={() => setStep("scan")}
        />
      )}
    </div>
  );
}
