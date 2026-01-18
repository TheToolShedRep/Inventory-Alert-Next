"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type HubAction = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  enabled: boolean;
};

export default function HomeHub() {
  const [toast, setToast] = useState<string>("");

  const actions: HubAction[] = useMemo(
    () => [
      // ✅ Live / working now
      {
        key: "alert",
        title: "Scan QR Alert",
        subtitle: "Mark items Low or Empty (with 30s undo)",
        href: "/alert",
        enabled: true,
      },
      {
        key: "scan",
        title: "Shopping Scan",
        subtitle: "Scan UPCs and log purchases (Catalog learns)",
        href: "/scan",
        enabled: true,
      },
      {
        key: "manager",
        title: "Manager List",
        subtitle: "View active items to buy + status",
        href: "/manager",
        enabled: true,
      },
      {
        key: "checklist",
        title: "Checklist",
        subtitle: "Daily tasks + items needing attention",
        href: "/checklist",
        enabled: true,
      },

      // 🔒 Coming soon (disabled)
      {
        key: "prep",
        title: "Prep Alerts",
        subtitle: "Time-based prep reminders (coming soon)",
        href: "/prep",
        enabled: false,
      },
      {
        key: "waste",
        title: "Waste Tracker",
        subtitle: "Log spoilage, mistakes, returns (coming soon)",
        href: "/waste",
        enabled: false,
      },
      {
        key: "catalog",
        title: "Catalog",
        subtitle: "Browse/edit item defaults (coming soon)",
        href: "/catalog",
        enabled: false,
      },
      {
        key: "purchases",
        title: "Purchases",
        subtitle: "View purchase history (coming soon)",
        href: "/purchases",
        enabled: false,
      },
      {
        key: "reports",
        title: "Reports",
        subtitle: "Trends + costs + waste insights (coming soon)",
        href: "/reports",
        enabled: false,
      },
      {
        key: "settings",
        title: "Settings",
        subtitle: "Notifications + app preferences (coming soon)",
        href: "/settings",
        enabled: false,
      },
    ],
    []
  );

  const handleDisabledClick = () => {
    setToast("Coming soon — not enabled yet.");
    window.clearTimeout((handleDisabledClick as any)._t);
    (handleDisabledClick as any)._t = window.setTimeout(
      () => setToast(""),
      1600
    );
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Inventory Alerts</h1>
        <p className="text-sm text-neutral-600">Choose what you’re doing.</p>
      </div>

      {toast ? (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
          {toast}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        {actions.map((a) =>
          a.enabled ? (
            <Link
              key={a.key}
              href={a.href}
              className="rounded-xl border bg-white p-4 active:scale-[0.99]"
            >
              <div className="text-base font-semibold">{a.title}</div>
              <div className="mt-1 text-sm text-neutral-600">{a.subtitle}</div>
            </Link>
          ) : (
            <button
              key={a.key}
              type="button"
              onClick={handleDisabledClick}
              className="rounded-xl border bg-neutral-50 p-4 text-left opacity-60"
            >
              <div className="text-base font-semibold">{a.title}</div>
              <div className="mt-1 text-sm text-neutral-600">{a.subtitle}</div>
              <div className="mt-2 inline-flex rounded-full border bg-white px-2 py-0.5 text-xs">
                Locked
              </div>
            </button>
          )
        )}
      </div>

      <div className="mt-6 text-xs text-neutral-500">
        Tip: Add this app to your phone’s home screen for faster access.
      </div>
    </div>
  );
}
