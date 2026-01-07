"use client";

import { useEffect } from "react";

export default function SubscribeOnLogin() {
  useEffect(() => {
    fetch("/api/subscribe", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
