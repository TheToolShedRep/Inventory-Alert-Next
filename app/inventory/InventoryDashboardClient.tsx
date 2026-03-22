"use client";

import { useEffect, useMemo, useState } from "react";

type InventoryRow = {
  upc: string;
  product_name: string;
  location: string;
  unit: string;
  vendor: string;
  current_stock: number;
  reorder_point: number;
  total_purchased: number;
  total_used: number;
  status: "ok" | "low" | "unknown";
};

type ApiResponse = {
  ok: boolean;
  scope: string;
  count: number;
  low_count: number;
  unknown_count: number;
  rows: InventoryRow[];
  error?: string;
};

function norm(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

export default function InventoryDashboardClient() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/inventory/stock", {
        cache: "no-store",
      });

      const data: ApiResponse = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load inventory");
      }

      setRows(data.rows || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const locations = useMemo(() => {
    const set = new Set<string>();

    for (const row of rows) {
      const loc = row.location?.trim();
      if (loc) set.add(loc);
    }

    return ["all", ...Array.from(set)];
  }, [rows]);

  const filteredRows = useMemo(() => {
    // First filter rows based on search + dropdowns
    const filtered = rows.filter((row) => {
      const q = norm(search);
      const matchesSearch =
        !q ||
        norm(row.product_name).includes(q) ||
        norm(row.upc).includes(q) ||
        norm(row.vendor).includes(q);

      const matchesStatus =
        statusFilter === "all" ? true : row.status === statusFilter;

      const matchesLocation =
        locationFilter === "all"
          ? true
          : norm(row.location) === norm(locationFilter);

      return matchesSearch && matchesStatus && matchesLocation;
    });

    // CHANGE: sort by STATUS first, then urgency within each status
    // New order:
    // 1. low
    // 2. unknown
    // 3. ok
    //
    // Inside each status:
    // - lower current_stock first (more urgent / more negative)
    // - then alphabetical by product name
    return filtered.sort((a, b) => {
      function getStatusPriority(row: InventoryRow) {
        if (row.status === "low") return 0;
        if (row.status === "unknown") return 1;
        return 2;
      }

      const statusDiff = getStatusPriority(a) - getStatusPriority(b);
      if (statusDiff !== 0) return statusDiff;

      const stockDiff = a.current_stock - b.current_stock;
      if (stockDiff !== 0) return stockDiff;

      return norm(a.product_name).localeCompare(norm(b.product_name));
    });
  }, [rows, search, statusFilter, locationFilter]);

  const totalItems = rows.length;
  const lowCount = rows.filter((r) => r.status === "low").length;
  const unknownCount = rows.filter((r) => r.status === "unknown").length;
  const okCount = rows.filter((r) => r.status === "ok").length;

  return (
    <div className="min-h-screen bg-white text-black p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Current Inventory</h1>
            <p className="text-sm text-gray-600">
              Live stock snapshot from Purchases minus Inventory Usage
            </p>
          </div>

          {/* CHANGE: wrapped action buttons in a flex container */}
          <div className="flex gap-2">
            {/* CHANGE: added Clear Filters button so search is not "stuck" behind status/location filters */}
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setLocationFilter("all");
              }}
              className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-gray-100"
            >
              Clear Filters
            </button>

            <button
              onClick={load}
              className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-gray-100"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border p-4 shadow-sm">
            <div className="text-sm text-gray-500">Total Items</div>
            <div className="mt-2 text-3xl font-bold">{totalItems}</div>
          </div>

          <div className="rounded-2xl border p-4 shadow-sm">
            <div className="text-sm text-gray-500">Low Stock</div>
            <div className="mt-2 text-3xl font-bold">{lowCount}</div>
          </div>

          <div className="rounded-2xl border p-4 shadow-sm">
            <div className="text-sm text-gray-500">Unknown</div>
            <div className="mt-2 text-3xl font-bold">{unknownCount}</div>
          </div>

          <div className="rounded-2xl border p-4 shadow-sm">
            <div className="text-sm text-gray-500">OK</div>
            <div className="mt-2 text-3xl font-bold">{okCount}</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            type="text"
            placeholder="Search product, UPC, vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border px-4 py-3 outline-none focus:ring"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border px-4 py-3 outline-none focus:ring"
          >
            <option value="all">All Statuses</option>
            <option value="ok">OK</option>
            <option value="low">Low</option>
            <option value="unknown">Unknown</option>
          </select>

          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-xl border px-4 py-3 outline-none focus:ring"
          >
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc === "all" ? "All Locations" : loc}
              </option>
            ))}
          </select>
        </div>

        {/* CHANGE: added a visible summary line so active filters are obvious */}
        <div className="mb-4 text-sm text-gray-600">
          Showing {filteredRows.length} of {rows.length} items
          {statusFilter !== "all" && ` • Status: ${statusFilter}`}
          {locationFilter !== "all" && ` • Location: ${locationFilter}`}
        </div>

        {loading ? (
          <div className="rounded-2xl border p-6">Loading inventory...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-red-700">
            {error}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Product</th>
                    <th className="px-4 py-3 font-semibold">UPC</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">In Stock</th>
                    <th className="px-4 py-3 font-semibold">Unit</th>
                    <th className="px-4 py-3 font-semibold">Reorder</th>
                    <th className="px-4 py-3 font-semibold">Vendor</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        No inventory rows found.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.upc} className="border-t">
                        <td className="px-4 py-3 font-medium">
                          {row.product_name || "—"}
                        </td>
                        <td className="px-4 py-3">{row.upc || "—"}</td>
                        <td className="px-4 py-3">{row.location || "—"}</td>
                        <td className="px-4 py-3">{row.current_stock}</td>
                        <td className="px-4 py-3">{row.unit || "—"}</td>
                        <td className="px-4 py-3">{row.reorder_point}</td>
                        <td className="px-4 py-3">{row.vendor || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                              row.status === "ok"
                                ? "bg-green-100 text-green-700"
                                : row.status === "low"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-gray-200 text-gray-700",
                            ].join(" ")}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
