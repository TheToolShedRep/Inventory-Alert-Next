// app/manager/shopping/ManagerShoppingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ShoppingRow = {
  timestamp?: string;
  upc?: string;
  product_name?: string;
  qty_to_order_base_units?: any;
  reorder_point?: any;
  note?: string;
};

type CatalogItemResponse = {
  ok: boolean;
  found?: boolean;
  upc?: string;
  product_name?: string;
  base_unit?: string;
  reorder_point?: number | null;
  par_level?: number | null;
  default_location?: string;
  preferred_vendor?: string;
  active?: string;
  notes?: string;
  error?: string;
};

function norm(v: any) {
  return String(v ?? "").trim();
}

function up(v: any) {
  return norm(v).toUpperCase();
}

function toNumOrBlank(v: any): string {
  const s = norm(v);
  if (!s) return "";
  const cleaned = s.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : "";
}

export default function ManagerShoppingClient() {
  const [rows, setRows] = useState<ShoppingRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Used for Purchased/Dismissed/Undo buttons
  const [busyUpc, setBusyUpc] = useState<string | null>(null);

  // Used for calibration save button
  const [busyCalUpc, setBusyCalUpc] = useState<string | null>(null);

  const [error, setError] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const [showHidden, setShowHidden] = useState(false);

  // ---- Calibration UI state ----
  const [openCalUpc, setOpenCalUpc] = useState<string | null>(null);

  // Cache catalog lookups by UPC so we don’t spam GETs
  const [catalogByUpc, setCatalogByUpc] = useState<Record<string, any>>({});

  // Draft edits per UPC (what user is typing)
  const [draftByUpc, setDraftByUpc] = useState<
    Record<
      string,
      {
        reorder_point: string;
        par_level: string;
        preferred_vendor: string;
        default_location: string;
        notes: string;
      }
    >
  >({});

  async function refresh(nextShowHidden?: boolean) {
    setError("");
    setStatusMsg("");
    setLoading(true);

    const useHidden =
      typeof nextShowHidden === "boolean" ? nextShowHidden : showHidden;

    try {
      const res = await fetch(
        `/api/shopping-list?includeHidden=${useHidden ? "1" : "0"}`,
        { method: "GET", cache: "no-store" },
      );

      const data = await res.json();
      if (!res.ok || !data?.ok)
        throw new Error(data?.error || "Failed to load shopping list");

      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function act(
    upcRaw: string,
    productNameRaw: string,
    action: "dismissed" | "purchased" | "undo",
  ) {
    const upc = up(upcRaw);
    if (!upc) return;

    setError("");
    setStatusMsg("");
    setBusyUpc(upc);

    try {
      const res = await fetch("/api/shopping/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          upc,
          action,
          product_name: norm(productNameRaw),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Action failed");

      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Action failed");
    } finally {
      setBusyUpc(null);
    }
  }

  async function loadCatalog(upcRaw: string) {
    const upc = up(upcRaw);
    if (!upc) return;

    // already cached
    if (catalogByUpc[upc]) return;

    try {
      const res = await fetch(
        `/api/catalog/item?upc=${encodeURIComponent(upc)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data: CatalogItemResponse = await res.json().catch(() => ({
        ok: false,
        error: "Bad JSON",
      }));

      if (!res.ok || !data?.ok)
        throw new Error(data?.error || "Catalog lookup failed");

      setCatalogByUpc((prev) => ({
        ...prev,
        [upc]: data,
      }));

      // Initialize draft from catalog values (or blanks)
      setDraftByUpc((prev) => {
        if (prev[upc]) return prev;
        return {
          ...prev,
          [upc]: {
            reorder_point:
              data?.reorder_point === null || data?.reorder_point === undefined
                ? ""
                : String(data.reorder_point),
            par_level:
              data?.par_level === null || data?.par_level === undefined
                ? ""
                : String(data.par_level),
            preferred_vendor: norm(data?.preferred_vendor),
            default_location: norm(data?.default_location),
            notes: norm(data?.notes),
          },
        };
      });
    } catch (e: any) {
      // Don’t hard-fail the page; just show an error banner
      setError(e?.message || "Catalog lookup failed");
    }
  }

  async function saveCalibration(upcRaw: string) {
    const upc = up(upcRaw);
    if (!upc) return;

    setError("");
    setStatusMsg("");
    setBusyCalUpc(upc);

    try {
      const draft = draftByUpc[upc];
      if (!draft) throw new Error("No draft loaded for this item");

      // Build a minimal patch object (only send fields the user has set)
      const patch: Record<string, any> = {};

      // Numeric fields: allow blank (don’t change) OR number
      // If you WANT blank to clear the field, we can send "" intentionally.
      // For now: if blank, we skip it (safe).
      const rp = toNumOrBlank(draft.reorder_point);
      if (rp !== "") patch.reorder_point = Number(rp);

      const pl = toNumOrBlank(draft.par_level);
      if (pl !== "") patch.par_level = Number(pl);

      const vendor = norm(draft.preferred_vendor);
      if (vendor) patch.preferred_vendor = vendor;

      const loc = norm(draft.default_location);
      if (loc) patch.default_location = loc;

      const notes = norm(draft.notes);
      if (notes) patch.notes = notes;

      if (Object.keys(patch).length === 0) {
        throw new Error("Nothing to save. Enter at least one field.");
      }

      const res = await fetch("/api/catalog/item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upc, patch }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Save failed");

      setStatusMsg(`✅ Saved calibration for ${upc}`);

      // Refresh shopping list so the new reorder_point/par_level can influence future computations
      await refresh();

      // Optionally close the panel after save
      setOpenCalUpc(null);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setBusyCalUpc(null);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const qa =
        Number(
          String(a.qty_to_order_base_units ?? "0").replace(/[^0-9.-]/g, ""),
        ) || 0;
      const qb =
        Number(
          String(b.qty_to_order_base_units ?? "0").replace(/[^0-9.-]/g, ""),
        ) || 0;
      return qb - qa;
    });
  }, [rows]);

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>Manager Shopping List</h1>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => refresh()}
          disabled={loading}
          style={{ padding: "8px 12px" }}
        >
          Refresh
        </button>

        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => {
              const next = e.target.checked;
              setShowHidden(next);
              refresh(next);
            }}
          />
          Show hidden (for Undo)
        </label>

        {loading ? <span>Loading…</span> : <span>{sorted.length} items</span>}
      </div>

      {statusMsg ? (
        <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>
          {statusMsg}
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {sorted.map((r) => {
          const upcVal = up(r.upc);
          const name = norm(r.product_name) || upcVal || "(missing upc)";
          const qty = norm(r.qty_to_order_base_units);
          const rp = norm(r.reorder_point);

          const disabledActions =
            !upcVal || busyUpc === upcVal || busyCalUpc === upcVal;
          const calOpen = openCalUpc === upcVal;
          const draft = upcVal ? draftByUpc[upcVal] : null;
          const catalog = upcVal ? catalogByUpc[upcVal] : null;

          return (
            <div
              key={`${upcVal}-${r.timestamp ?? ""}`}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
                display: "grid",
                gap: 6,
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
                  <div style={{ fontWeight: 900 }}>{name}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    UPC: {upcVal || "—"} • Reorder point: {rp || "—"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Qty to order
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {qty || "0"}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 6,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() =>
                    act(upcVal, r.product_name || name, "dismissed")
                  }
                  disabled={disabledActions}
                  style={{ padding: "8px 12px" }}
                >
                  {busyUpc === upcVal ? "…" : "Dismiss"}
                </button>

                <button
                  onClick={() =>
                    act(upcVal, r.product_name || name, "purchased")
                  }
                  disabled={disabledActions}
                  style={{ padding: "8px 12px" }}
                >
                  {busyUpc === upcVal ? "…" : "Purchased"}
                </button>

                <button
                  onClick={() => act(upcVal, r.product_name || name, "undo")}
                  disabled={disabledActions}
                  style={{ padding: "8px 12px" }}
                >
                  {busyUpc === upcVal ? "…" : "Undo"}
                </button>

                {/* ✅ Inline calibration toggle */}
                <button
                  onClick={async () => {
                    if (!upcVal) return;
                    setError("");
                    setStatusMsg("");
                    const next = calOpen ? null : upcVal;
                    setOpenCalUpc(next);

                    // Load catalog + draft on open
                    if (!calOpen) await loadCatalog(upcVal);
                  }}
                  disabled={
                    !upcVal || busyUpc === upcVal || busyCalUpc === upcVal
                  }
                  style={{ padding: "8px 12px", fontWeight: 700 }}
                >
                  {calOpen ? "Close Calibration" : "Calibrate"}
                </button>
              </div>

              {calOpen ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px dashed #bbb",
                    background: "#fafafa",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    Catalog calibration (updates Catalog sheet)
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Tip: set <b>Reorder Point</b> = “when we should buy again”,
                    and <b>Par Level</b> = “ideal stock after buying”.
                  </div>

                  {/* Show a little read-only snapshot when available */}
                  {catalog?.ok && catalog?.found ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Current Catalog → RP: {catalog.reorder_point ?? "—"} •
                      Par: {catalog.par_level ?? "—"} • Vendor:{" "}
                      {norm(catalog.preferred_vendor) || "—"} • Location:{" "}
                      {norm(catalog.default_location) || "—"}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                      Catalog row not found yet — saving will create it.
                    </div>
                  )}

                  <div style={{ display: "grid", gap: 8 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>
                          Reorder Point
                        </span>
                        <input
                          inputMode="numeric"
                          placeholder="e.g. 30"
                          value={draft?.reorder_point ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftByUpc((prev) => ({
                              ...prev,
                              [upcVal]: {
                                ...(prev[upcVal] || {
                                  reorder_point: "",
                                  par_level: "",
                                  preferred_vendor: "",
                                  default_location: "",
                                  notes: "",
                                }),
                                reorder_point: v,
                              },
                            }));
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                          }}
                        />
                      </label>

                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>
                          Par Level
                        </span>
                        <input
                          inputMode="numeric"
                          placeholder="e.g. 60"
                          value={draft?.par_level ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftByUpc((prev) => ({
                              ...prev,
                              [upcVal]: {
                                ...(prev[upcVal] || {
                                  reorder_point: "",
                                  par_level: "",
                                  preferred_vendor: "",
                                  default_location: "",
                                  notes: "",
                                }),
                                par_level: v,
                              },
                            }));
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                          }}
                        />
                      </label>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>
                          Preferred Vendor
                        </span>
                        <input
                          placeholder="e.g. Walmart"
                          value={draft?.preferred_vendor ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftByUpc((prev) => ({
                              ...prev,
                              [upcVal]: {
                                ...(prev[upcVal] || {
                                  reorder_point: "",
                                  par_level: "",
                                  preferred_vendor: "",
                                  default_location: "",
                                  notes: "",
                                }),
                                preferred_vendor: v,
                              },
                            }));
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                          }}
                        />
                      </label>

                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>
                          Default Location
                        </span>
                        <input
                          placeholder="e.g. Kitchen"
                          value={draft?.default_location ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftByUpc((prev) => ({
                              ...prev,
                              [upcVal]: {
                                ...(prev[upcVal] || {
                                  reorder_point: "",
                                  par_level: "",
                                  preferred_vendor: "",
                                  default_location: "",
                                  notes: "",
                                }),
                                default_location: v,
                              },
                            }));
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                          }}
                        />
                      </label>
                    </div>

                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        Notes
                      </span>
                      <input
                        placeholder="Why are we changing this?"
                        value={draft?.notes ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraftByUpc((prev) => ({
                            ...prev,
                            [upcVal]: {
                              ...(prev[upcVal] || {
                                reorder_point: "",
                                par_level: "",
                                preferred_vendor: "",
                                default_location: "",
                                notes: "",
                              }),
                              notes: v,
                            },
                          }));
                        }}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => saveCalibration(upcVal)}
                      disabled={
                        !upcVal || busyCalUpc === upcVal || busyUpc === upcVal
                      }
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "#111",
                        color: "white",
                        fontWeight: 800,
                      }}
                    >
                      {busyCalUpc === upcVal ? "Saving…" : "Save to Catalog"}
                    </button>

                    <button
                      onClick={() => setOpenCalUpc(null)}
                      disabled={busyCalUpc === upcVal}
                      style={{ padding: "10px 12px", borderRadius: 10 }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {r.note ? (
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Note: {norm(r.note)}
                </div>
              ) : null}
            </div>
          );
        })}

        {!loading && sorted.length === 0 ? (
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            No items right now.
            {!showHidden
              ? " (Turn on “Show hidden” to undo purchased/dismissed items.)"
              : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
