"use client";

import { SignOutButton } from "@clerk/nextjs";

export default function LogoutButton() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button>Logout</button>
    </SignOutButton>
  );
}
