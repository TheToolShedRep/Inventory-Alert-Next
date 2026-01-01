"use client";
import { SignOutButton } from "@clerk/nextjs";

export function LogoutButton() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        Logout
      </button>
    </SignOutButton>
  );
}
