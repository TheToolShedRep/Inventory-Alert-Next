import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { addSubscriberEmail } from "@/lib/subscribers";

export const runtime = "nodejs";

export async function POST() {
  // ✅ App Router: auth() is async
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Not signed in" },
      { status: 401 }
    );
  }

  // ✅ In your Clerk version, clerkClient is async function
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const email =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress || user.emailAddresses[0]?.emailAddress;

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "No email found" },
      { status: 400 }
    );
  }

  const result = await addSubscriberEmail(email);

  // ✅ Spread first, then set ok so it can't be overwritten
  return NextResponse.json({
    ...result,
    ok: true,
    email,
  });
}
