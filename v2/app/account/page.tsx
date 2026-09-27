import { redirect } from "next/navigation";

import AccountClient from "./account-client";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createSupabaseServer();

  const { data: claimsData, error } =
    await supabase.auth.getClaims();

  const email =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : null;

  if (error || !email) {
    redirect("/login");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 800,
          margin: "0 auto",
        }}
      >
        <h1 style={{ marginTop: 0 }}>
          Account
        </h1>

        <AccountClient email={email} />
      </div>
    </main>
  );
}
