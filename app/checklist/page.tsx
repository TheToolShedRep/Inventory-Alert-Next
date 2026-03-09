import Link from "next/link";
import { getTodayChecklist } from "@/lib/sheets";
import ChecklistClient from "./ChecklistClient";
import AppShell from "@/app/components/AppShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ hidden?: string }>;
}) {
  const params = await searchParams;
  const includeHidden = params?.hidden === "1";
  const hiddenHref = includeHidden ? "/checklist" : "/checklist?hidden=1";

  const items = await getTodayChecklist();

  return (
    <AppShell title="Today’s Checklist">
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <header
          style={{ display: "flex", justifyContent: "space-between", gap: 16 }}
        >
          <nav style={{ display: "flex", gap: 12 }}>
            <Link href="/manager">Manager</Link>
            <Link href={hiddenHref}>
              {includeHidden ? "Hide hidden" : "Show hidden"}
            </Link>
            <Link href="/alert?item=milk&location=kitchen">Test Alert</Link>
          </nav>
        </header>

        <p style={{ opacity: 0.8 }}>Low / Empty items reported today.</p>

        <ChecklistClient
          initialItems={items.map((it) => ({
            timestamp: it.timestamp,
            item: it.item,
            qty: it.qty,
            location: it.location,
            note: it.note,
            alertId: it.alertId,
          }))}
        />
      </main>
    </AppShell>
  );
}
