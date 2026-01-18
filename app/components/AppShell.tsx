// app/components/AppShell.tsx
import TaskHeader from "@/app/components/TaskHeader";

export default function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f9" }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "16px",
        }}
      >
        {/* Optional header (Back + Tasks) */}
        {title ? <TaskHeader title={title} /> : null}

        {children}
      </div>
    </div>
  );
}
