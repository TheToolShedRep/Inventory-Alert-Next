import AlertClient from "./AlertClient";

export const dynamic = "force-dynamic"; // make sure this is not prerendered

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function AlertPage({ searchParams }: PageProps) {
  const itemRaw = searchParams?.item;
  const locationRaw = searchParams?.location;

  const item = Array.isArray(itemRaw) ? itemRaw[0] : itemRaw || "";
  const location = Array.isArray(locationRaw)
    ? locationRaw[0]
    : locationRaw || "";

  return <AlertClient item={item} location={location} />;
}
