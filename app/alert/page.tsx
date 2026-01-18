// app/alert/page.tsx
import AppShell from "@/app/components/AppShell";
import AlertClient from "./AlertClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    item?: string;
    location?: string;
  }>;
};

export default async function AlertPage({ searchParams }: PageProps) {
  // Next.js 16: searchParams is async
  const sp = (await searchParams) || {};

  const item = (sp.item || "").trim();
  const location = (sp.location || "").trim();

  return (
    <AppShell title="Scan QR Alert">
      <AlertClient item={item} location={location} />
    </AppShell>
  );
}
