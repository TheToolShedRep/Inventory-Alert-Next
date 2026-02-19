"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function todayNY(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ShoppingSnoozePage() {
  const router = useRouter();
  const params = useSearchParams();

  const upc = params.get("upc") || "";
  const returnTo = params.get("return") || "/manager";
  const date = useMemo(() => todayNY(), []);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!upc) router.replace(returnTo);
  }, [upc, returnTo, router]);

  async function submit() {
    if (!upc) return;
    setSaving(true);

    const res = await fetch("/api/shopping/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, upc, action: "snoozed", note: "" }),
    });

    const data = await res.json();
    if (!data?.ok) {
      alert(data?.error || "Snooze failed");
      setSaving(false);
      return;
    }

    router.push(returnTo);
    router.refresh();
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-2">Snooze Until Tomorrow</h1>
      <p className="text-sm opacity-70 mb-4">
        This hides the item for today. It will reappear automatically tomorrow
        if still low.
      </p>

      <div className="rounded border p-3 mb-4">
        <div className="font-medium">{upc}</div>
        <div className="text-sm opacity-70">Action: snoozed</div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="w-full border rounded p-2 font-medium"
      >
        {saving ? "Saving…" : "Snooze"}
      </button>

      <button
        type="button"
        onClick={() => router.push(returnTo)}
        className="w-full mt-2 text-sm underline opacity-80"
      >
        Cancel
      </button>
    </div>
  );
}
