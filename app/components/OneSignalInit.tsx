"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";

export default function OneSignalInit() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!appId) {
      console.warn("Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
      return;
    }

    OneSignal.init({
      appId,
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath: "OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js",
      // optional but helpful
      //   welcomeNotification: { disable: true },
    }).catch((err) => console.error("OneSignal init error:", err));
  }, []);

  return null;
}
