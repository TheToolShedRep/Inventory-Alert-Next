"use client";

import { useSearchParams } from "next/navigation";

export default function PurchaseClient() {
  const searchParams = useSearchParams();
  const hidden = searchParams.get("hidden");

  return (
    <div>
      {/* your existing purchase UI here */}
      <div>hidden: {hidden}</div>
    </div>
  );
}
