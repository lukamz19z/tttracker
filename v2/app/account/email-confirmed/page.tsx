import Link from "next/link";

export default function EmailConfirmedPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        className="tt-card"
        style={{
          width: "100%",
          maxWidth: 430,
          padding: 28,
        }}
      >
        <div
          style={{
            color: "#7dd3fc",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          TTTracker
        </div>

        <h1 style={{ marginBottom: 12 }}>
          Email confirmed
        </h1>

        <p
          style={{
            color: "#cbd5e1",
            lineHeight: 1.6,
          }}
        >
          Your confirmation has been recorded. If a second confirmation is required, complete it from the other email address.
        </p>

        <Link
          href="/account"
          style={{
            display: "inline-block",
            marginTop: 10,
            color: "#7dd3fc",
          }}
        >
          Account
        </Link>
      </div>
    </main>
  );
}
