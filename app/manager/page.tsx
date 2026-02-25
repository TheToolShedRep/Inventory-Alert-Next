// app/manager/page.tsx
import Link from "next/link";
import { getShoppingList, getTodayManagerAlerts } from "@/lib/sheets";
import ManagerClient from "./ManagerClient";
import { LogoutButton } from "../components/LogoutButton";
import EnableNotificationsButton from "../components/EnableNotificationsButton";
import SubscribeOnLogin from "./SubscribeOnLogin";
import AppShell from "@/app/components/AppShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isSheets429(err: any) {
  // googleapis errors often have code/status, but sometimes just message text
  const msg = String(err?.message || "");
  return (
    err?.code === 429 || err?.status === 429 || msg.includes("Quota exceeded")
  );
}

export default async function ManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ hidden?: string }>;
}) {
  const params = await searchParams;
  const includeHidden = params?.hidden === "1";
  const hiddenHref = includeHidden ? "/manager" : "/manager?hidden=1";

  // ✅ CHANGE: do NOT allow one failing sheet read to crash the entire page
  const [alertsRes, shoppingRes] = await Promise.allSettled([
    getTodayManagerAlerts(),
    getShoppingList({ includeHidden }),
  ]);

  let rows: any[] = [];
  let shoppingList: any[] = [];

  let alertsError: string | null = null;
  let shoppingError: string | null = null;

  if (alertsRes.status === "fulfilled") {
    rows = alertsRes.value || [];
  } else {
    alertsError = alertsRes.reason?.message || "Failed to load alerts.";
  }

  if (shoppingRes.status === "fulfilled") {
    shoppingList = shoppingRes.value || [];
  } else {
    shoppingError =
      shoppingRes.reason?.message || "Failed to load shopping list.";
  }

  const showRateLimitBanner =
    isSheets429(alertsRes.status === "rejected" ? alertsRes.reason : null) ||
    isSheets429(shoppingRes.status === "rejected" ? shoppingRes.reason : null);

  return (
    <AppShell title="Manager Dashboard">
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <header
          style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
        >
          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/checklist">Checklist</Link>
            <a href="/manager.csv">Export CSV</a>
            <Link href={hiddenHref}>
              {includeHidden ? "Hide hidden" : "Show hidden"}
            </Link>
            <LogoutButton />
          </nav>

          <div className="flex items-center gap-3">
            <EnableNotificationsButton />
          </div>

          <SubscribeOnLogin />
        </header>

        {/* ✅ CHANGE: Banner instead of hard crash on Sheets 429 */}
        {showRateLimitBanner ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(220, 38, 38, 0.35)",
              background: "rgba(220, 38, 38, 0.08)",
              fontWeight: 700,
            }}
          >
            Google Sheets is rate-limiting reads right now (429). Refresh in ~60
            seconds.
          </div>
        ) : null}

        {/* Optional: show any other errors */}
        {alertsError && !showRateLimitBanner ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            Alerts error: {alertsError}
          </div>
        ) : null}

        {shoppingError && !showRateLimitBanner ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            Shopping list error: {shoppingError}
          </div>
        ) : null}

        {/* Auto reorder section */}
        <section style={{ marginTop: 16, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 8px 0" }}>Auto Reorder (Shopping List)</h2>

          {shoppingList.length === 0 ? (
            <p style={{ opacity: 0.75 }}>
              No items currently flagged for reorder.
            </p>
          ) : (
            <div
              style={{
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 140px 1fr 260px",
                  padding: "10px 12px",
                  fontWeight: 600,
                  background: "rgba(0,0,0,0.03)",
                }}
              >
                <div>Item</div>
                <div>On hand</div>
                <div>Order qty</div>
                <div>Vendor</div>
                <div>Actions</div>
              </div>

              {shoppingList.map((r: any, idx: number) => {
                const upc = String(r.upc || "").trim();
                const label = r.product_name || upc;
                const returnTo = "/manager";

                return (
                  <div
                    key={`${upc || idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px 140px 1fr 260px",
                      padding: "10px 12px",
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {upc}{" "}
                        {r.default_location ? `• ${r.default_location}` : ""}
                      </div>
                    </div>

                    <div>
                      {r.on_hand_base_units ?? ""}{" "}
                      <span style={{ fontSize: 12, opacity: 0.7 }}>
                        {r.base_unit || ""}
                      </span>
                    </div>

                    <div>
                      {r.qty_to_order_base_units ?? ""}{" "}
                      <span style={{ fontSize: 12, opacity: 0.7 }}>
                        {r.base_unit || ""}
                      </span>
                    </div>

                    <div>{r.preferred_vendor || "—"}</div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link
                        href={`/purchase?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                        style={{ textDecoration: "underline" }}
                      >
                        Restocked
                      </Link>

                      <Link
                        href={`/shopping/dismiss?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                        style={{ textDecoration: "underline" }}
                      >
                        Dismiss
                      </Link>

                      <Link
                        href={`/shopping/snooze?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                        style={{ textDecoration: "underline" }}
                      >
                        Snooze
                      </Link>

                      <Link
                        href={`/shopping/undo?upc=${encodeURIComponent(upc)}&return=${encodeURIComponent(returnTo)}`}
                        style={{ textDecoration: "underline", opacity: 0.8 }}
                      >
                        Undo
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p style={{ opacity: 0.8 }}>Click a header to sort.</p>

        {/* Staff alerts table */}
        <ManagerClient rows={rows} />
      </main>
    </AppShell>
  );
}
