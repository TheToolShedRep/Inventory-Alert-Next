// app/manager/page.tsx
import Link from "next/link";
import { getTodayManagerAlerts } from "@/lib/sheets";
import ManagerClient from "./ManagerClient";
import { LogoutButton } from "../components/LogoutButton";
import EnableNotificationsButton from "../components/EnableNotificationsButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ManagerPage() {
  const rows = await getTodayManagerAlerts(); // active + resolved

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
      >
        <h1 style={{ margin: 0 }}>Manager Dashboard</h1>
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/checklist">Checklist</Link>
          <a href="/manager.csv">Export CSV</a>
          <LogoutButton />
        </nav>

        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/checklist">Checklist</Link>
          <a href="/manager.csv">Export CSV</a>
        </nav>

        <div className="flex items-center gap-3">
          <EnableNotificationsButton />
        </div>
      </header>

      <p style={{ opacity: 0.8 }}>Click a header to sort.</p>

      <ManagerClient rows={rows} />
    </main>
  );
}
