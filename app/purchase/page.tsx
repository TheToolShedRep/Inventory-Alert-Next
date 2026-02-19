import { Suspense } from "react";
import PurchaseClient from "./PurchaseClient";

export const dynamic = "force-dynamic"; // prevents static prerender issues

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <PurchaseClient />
    </Suspense>
  );
}
