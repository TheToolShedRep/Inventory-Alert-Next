"use client";

import OneSignal from "react-onesignal";

export default function EnableNotificationsButton() {
  return (
    <button
      onClick={async () => {
        await OneSignal.Slidedown.promptPush();
      }}
    >
      Enable Inventory Alerts
    </button>
  );
}
