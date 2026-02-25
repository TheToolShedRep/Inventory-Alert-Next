// app/manager/inventory/InventoryOverviewClient.tsx
"use client";

import { useMemo, useState } from "react";

function norm(v: any) {
  return String(v ?? "").trim();
}
function up(v: any) {
  return norm(v).toUpperCase();
}

type OnHandRes = {
  ok: boolean;
  scope?: string;
  error?: string;
  upc?: string;
  base_unit?: string;
  purchased_base_units?: number;
  used_base_units?: number;
  adjustment_base_units?: number;
  on_hand_base_units?: number;
};

type CatalogRes = {
  ok: boolean;
  found?: boolean;
  error?: string;
  upc?: string;
  product_name?: string;
  base_unit?: string;
  reorder_point?: number | null;
  par_level?: number | null;
  default_location?: string;
  preferred_vendor?: string;
};

export default function InventoryOverviewClient() {
  const [upcInput, setUpcInput] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [onHand, setOnHand] = useState<OnHandRes | null>(null);
  const [catalog, setCatalog] = useState<CatalogRes | null>(null);

  // ✅ NEW: if filter excludes the item, we keep results but hide the card
  const [filteredOut, setFilteredOut] = useState<string>("");

  async function search() {
    const upc = up(upcInput);
    if (!upc) return;

    setLoading(true);
    setErr("");
    setFilteredOut("");
    setOnHand(null);
    setCatalog(null);

    try {
      const [a, b] = await Promise.all([
        fetch(`/api/inventory/on-hand?upc=${encodeURIComponent(upc)}`, {
          cache: "no-store",
        }),
        fetch(`/api/catalog/item?upc=${encodeURIComponent(upc)}`, {
          cache: "no-store",
        }),
      ]);

      const aJson = (await a.json()) as OnHandRes;
      const bJson = (await b.json()) as CatalogRes;

      if (!a.ok || !aJson.ok)
        throw new Error(aJson.error || "On-hand lookup failed");
      if (!b.ok || !bJson.ok)
        throw new Error(bJson.error || "Catalog lookup failed");

      // ✅ If location filter exists and catalog found, enforce it (hide the card)
      const filter = norm(locationFilter).toLowerCase();
      if (filter && bJson?.found) {
        const loc = norm(bJson.default_location || "").toLowerCase();
        if (!loc.includes(filter)) {
          setFilteredOut(
            `Filtered out: location "${bJson.default_location || "—"}" does not match "${locationFilter}".`,
          );
        }
      }

      setOnHand(aJson);
      setCatalog(bJson);
    } catch (e: any) {
      setErr(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const displayName = useMemo(() => {
    if (catalog?.found && catalog.product_name) return catalog.product_name;
    return up(upcInput) || "—";
  }, [catalog, upcInput]);

  const catalogStatus = useMemo(() => {
    if (!catalog) return "—";
    return catalog.found ? "FOUND ✅" : "NOT FOUND ❌";
  }, [catalog]);

  // ✅ Use on-hand base_unit, but fallback to catalog base_unit if needed
  const displayUnit = useMemo(() => {
    return norm(onHand?.base_unit) || norm(catalog?.base_unit) || "each";
  }, [onHand, catalog]);

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>Inventory Overview</h1>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={upcInput}
          onChange={(e) => setUpcInput(e.target.value)}
          placeholder="Search by UPC (e.g. EGG)"
          style={{ padding: "8px 10px", minWidth: 260 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />

        <input
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          placeholder="Filter by location (optional)"
          style={{ padding: "8px 10px", minWidth: 240 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />

        <button
          onClick={search}
          disabled={loading}
          style={{ padding: "8px 12px" }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {err ? (
        <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
          {err}
        </div>
      ) : null}

      {filteredOut ? (
        <div style={{ marginTop: 12, color: "#8a6d3b", fontWeight: 700 }}>
          {filteredOut}
        </div>
      ) : null}

      {/* ✅ Show results card only if we have on-hand and not filtered out */}
      {onHand && !filteredOut ? (
        <div
          style={{
            marginTop: 16,
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{displayName}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                UPC: {onHand.upc}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Catalog</div>
              <div style={{ fontWeight: 900 }}>{catalogStatus}</div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <div>
              <b>On hand:</b> {onHand.on_hand_base_units} {displayUnit}
            </div>

            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Source: Purchases - Usage + Adjustments
            </div>

            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Purchases: {onHand.purchased_base_units} • Usage:{" "}
              {onHand.used_base_units} • Adjustments:{" "}
              {onHand.adjustment_base_units}
            </div>

            <div style={{ marginTop: 10 }}>
              <b>Reorder point:</b>{" "}
              {catalog?.found ? (catalog.reorder_point ?? "—") : "—"}
            </div>

            <div>
              <b>Par level:</b>{" "}
              {catalog?.found ? (catalog.par_level ?? "—") : "—"}
            </div>

            <div>
              <b>Location:</b>{" "}
              {catalog?.found ? norm(catalog.default_location) || "—" : "—"}
            </div>
          </div>

          {!catalog?.found ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Not found in Catalog — reorder point/par/location unavailable.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
