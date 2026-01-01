// app/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const a = await auth(); // ✅ Clerk v6 returns a Promise here

  if (a.userId) redirect("/manager");
  redirect("/sign-in");
}
