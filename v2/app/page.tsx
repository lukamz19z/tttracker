import { redirect } from "next/navigation";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

export default async function RootPage() {
  const session = await createSupabaseServer();

  const { data: claimsData } =
    await session.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub === "string"
      ? claimsData.claims.sub
      : null;

  if (!userId) {
    redirect("/login");
  }

  const admin = createSupabaseAdmin();

  const { data: platformAdmin } = await admin
    .from("v2_platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (platformAdmin) {
    redirect("/platform-admin");
  }

  const { data: membership } = await admin
    .from("organisation_users")
    .select("organisation_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/account");
  }

  const { data: setupState } = await admin
    .from("v2_organisation_setup_state")
    .select("status")
    .eq(
      "organisation_id",
      membership.organisation_id,
    )
    .maybeSingle();

  if (setupState?.status !== "completed") {
    redirect(
      `/setup?organisation=${encodeURIComponent(
        membership.organisation_id,
      )}`,
    );
  }

  redirect(
    `/workspace?organisation=${encodeURIComponent(
      membership.organisation_id,
    )}`,
  );
}
