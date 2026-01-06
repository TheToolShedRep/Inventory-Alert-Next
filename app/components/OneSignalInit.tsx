"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    OneSignal?: any;
  }
}

export default function OneSignalInit() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) {
      console.warn("Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
      return;
    }

    console.log("ONESIGNAL INIT: appId =", appId);

    // Ensure OneSignal array exists
    window.OneSignal = window.OneSignal || [];
    const OneSignal = window.OneSignal;

    OneSignal.push(function () {
      OneSignal.init({
        appId,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js",
      });
    });

    // Load OneSignal SDK script once
    const scriptId = "onesignal-sdk";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

  return null;
}
