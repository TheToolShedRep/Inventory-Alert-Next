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
  // Even if Render gives {}, AlertClient will fallback to client query params
  const item = (searchParams?.item || "").trim();
  const location = (searchParams?.location || "").trim();

  return <AlertClient item={item} location={location} />;
}
