"use client";

import { useRouter } from "next/navigation";

export default function TaskHeader({ title }: { title: string }) {
  const router = useRouter();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          border: "1px solid #d7dbe0",
          background: "#fff",
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Back
      </button>

      <div style={{ fontSize: 14, fontWeight: 600, color: "#222" }}>
        {title}
      </div>

      <button
        type="button"
        onClick={() => router.push("/")}
        style={{
          border: "1px solid #d7dbe0",
          background: "#fff",
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Tasks
      </button>
    </div>
  );
}
