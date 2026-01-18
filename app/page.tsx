// app/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import HomeHub from "./HomeHub";

export default async function HomePage() {
  const a = await auth();

  if (!a.userId) redirect("/sign-in");

  // Logged in → show the hub (mobile-first)
  return <HomeHub />;
}
