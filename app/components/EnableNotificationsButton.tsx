"use client";

import OneSignal from "react-onesignal";

export default function EnableNotificationsButton() {
  const enable = async () => {
    try {
      console.log("🔔 Prompting push permission...");

      // This opens OneSignal's permission prompt / slidedown
      await OneSignal.Slidedown.promptPush();

      const optedIn = await OneSignal.User.PushSubscription.optedIn;
      console.log("✅ Push opted-in:", optedIn);
    } catch (err) {
      console.error("❌ Push prompt failed:", err);
      alert(
        "Push prompt failed. If you previously blocked notifications, reset site permissions and try again."
      );
    }
  };

  return (
    <button
      onClick={enable}
      className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-100"
      type="button"
    >
      Enable Notifications
    </button>
  );
}
