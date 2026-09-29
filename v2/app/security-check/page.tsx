import SecurityCheckClient from "./security-check-client";

export default function SecurityCheckPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <SecurityCheckClient />
    </main>
  );
}
