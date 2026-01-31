"use client";

import { useEffect, useState } from "react";
import OneSignal from "react-onesignal";

export default function OneSignalInit() {
  const [debug, setDebug] = useState<string>("OneSignal: not started");

  useEffect(() => {
    // Skip init on localhost
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") return;
    }

    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!appId) {
      setDebug("OneSignal: MISSING NEXT_PUBLIC_ONESIGNAL_APP_ID");
      return;
    }

    // ✅ IMPORTANT: Use absolute paths from site root in Next.js
    const workerPath = "/OneSignalSDKWorker.js";
    const updaterPath = "/OneSignalSDKUpdaterWorker.js";

    setDebug(`OneSignal: appId loaded (${appId.slice(0, 6)}...)`);

    (async () => {
      try {
        // ✅ Quick sanity check: Android must be able to fetch these exact URLs
        const w = await fetch(workerPath, { cache: "no-store" });
        const u = await fetch(updaterPath, { cache: "no-store" });
        console.log("🔎 OneSignal worker fetch:", workerPath, w.status);
        console.log("🔎 OneSignal updater fetch:", updaterPath, u.status);

        await OneSignal.init({
          appId,

          // ✅ IMPORTANT: make SW valid across the whole PWA
          serviceWorkerPath: workerPath,
          serviceWorkerUpdaterPath: updaterPath,
          serviceWorkerParam: { scope: "/" },
        });

        setDebug(`OneSignal: init OK (${appId.slice(0, 6)}...)`);

        // Helpful: confirms whether OneSignal thinks push is enabled
        const permission = await OneSignal.Notifications.permission;
        console.log("✅ OneSignal notification permission:", permission);
      } catch (err) {
        console.error("❌ OneSignal init error:", err);
        setDebug("OneSignal: init FAILED (check console)");
      }
    })();
  }, []);

  // TEMP debug badge
  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 999999,
        fontSize: 12,
        padding: "6px 8px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.75)",
        color: "white",
        maxWidth: 280,
      }}
    >
      {debug}
    </div>
  );
}
