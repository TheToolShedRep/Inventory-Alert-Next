"use client";

import { SignOutButton } from "@clerk/nextjs";

export default function LogoutButton() {
  return (
    <SignOutButton redirectUrl="/sign-in">
      <button
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Log out
      </button>
    </SignOutButton>
  );
}
