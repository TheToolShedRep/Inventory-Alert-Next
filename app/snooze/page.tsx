import { Suspense } from "react";
import SnoozeClient from "./SnoozeClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <SnoozeClient />
    </Suspense>
  );
}
