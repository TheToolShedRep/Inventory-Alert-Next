"use client";

import OneSignal from "react-onesignal";

export default function EnableNotificationsButton() {
  const enable = async () => {
    try {
      console.log("🔔 enable() clicked");

      // If init didn't run, this will error.
      const permission = await Notification.permission;
      console.log("🔎 Browser Notification.permission =", permission);

      const isSupported = await OneSignal.Notifications.isPushSupported();
      console.log("🔎 OneSignal push supported =", isSupported);

      const optedIn = await OneSignal.User.PushSubscription.optedIn;
      console.log("🔎 OneSignal optedIn BEFORE =", optedIn);

      await OneSignal.Slidedown.promptPush();

      const optedInAfter = await OneSignal.User.PushSubscription.optedIn;
      console.log("✅ OneSignal optedIn AFTER =", optedInAfter);
    } catch (err) {
      console.error("❌ Push prompt failed", err);
      alert(String(err));
    }
  };

  return (
    <button
      onClick={enable}
      style={{ padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
      type="button"
    >
      Enable Notifications
    </button>
  );
}
