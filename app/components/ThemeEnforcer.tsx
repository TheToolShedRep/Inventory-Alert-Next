"use client";

import { useEffect } from "react";

export default function ThemeEnforcer() {
  useEffect(() => {
    // Force LIGHT mode no matter what iPhone/system is set to
    document.documentElement.classList.remove("dark");
  }, []);

  return null;
}
