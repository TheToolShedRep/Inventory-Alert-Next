"use client";

import { useEffect, useState } from "react";
import OneSignal from "react-onesignal";

export default function OneSignalInit() {
  const [debug, setDebug] = useState<string>("OneSignal: not started");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        return;
      }
    }

    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!appId) {
      setDebug("OneSignal: MISSING NEXT_PUBLIC_ONESIGNAL_APP_ID");
      return;
    }

    setDebug(`OneSignal: appId loaded (${appId.slice(0, 6)}...)`);

    OneSignal.init({
      appId,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: "OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js",
    })
      .then(() => setDebug(`OneSignal: init OK (${appId.slice(0, 6)}...)`))
      .catch((err) => {
        console.error("OneSignal init error:", err);
        setDebug("OneSignal: init FAILED (check console)");
      });
  }, []);

  // Tiny badge in bottom-left on every page (TEMPORARY)
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
