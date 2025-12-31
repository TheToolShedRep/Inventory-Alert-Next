// app/alert/page.tsx
import AlertClient from "./AlertClient";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    item?: string;
    location?: string;
  };
};

export default function AlertPage({ searchParams }: PageProps) {
  const item = (searchParams?.item || "").trim();
  const location = (searchParams?.location || "").trim();

  return <AlertClient item={item} location={location} />;
}
