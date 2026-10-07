import { redirect } from "next/navigation";

import WorkspaceFrame from "@/components/workspace/workspace-frame";
import AccountClient from "./account-client";
import MfaPanel from "./mfa-panel";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ organisation?: string }> }) {
  const organisationId = (await searchParams).organisation;
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
    <WorkspaceFrame organisationId={organisationId} personal>
    <div
      style={{
        padding: "0",
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

        <p style={{ color: "#94a3b8" }}>Personal account</p>
        <div style={{ display: "grid", gap: 20 }}>
          <AccountClient email={email} />
          <MfaPanel />
        </div>
      </div>
    </div>
    </WorkspaceFrame>
  );
}
