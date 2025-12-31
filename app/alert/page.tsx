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

  return (
    <div>
      {/* DEBUG (temporary): proves what the server is receiving */}
      <pre style={{ padding: 12, background: "#f3f4f6", borderRadius: 8 }}>
        SERVER searchParams: {JSON.stringify(searchParams)}
      </pre>

      <AlertClient item={item} location={location} />
    </div>
  );
}
