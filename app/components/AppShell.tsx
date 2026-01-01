export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f9" }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "16px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
