import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProjectListContext } from "@/lib/projects/list-context";
import { isPlatformAdmin } from "@/lib/platform/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import AppShell from "./app-shell";

export default async function WorkspaceFrame({
  children,
  organisationId,
  personal = false,
}: {
  children: React.ReactNode;
  organisationId?: string | null;
  personal?: boolean;
}) {
  let context;
  try {
    context = await requireProjectListContext(organisationId,personal ? "personal" : "workspace");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "WORKSPACE_ORGANISATION_ACCESS_DENIED"
    )
      notFound();
    if (
      !(error instanceof Error) ||
      error.message !== "NO_ACTIVE_ORGANISATION_MEMBERSHIP"
    )
      throw error;
  }
  if (context)
    return (
      <AppShell
        organisation={context.organisation}
        memberships={context.memberships}
        sections={context.sections}
        email={context.email}
        contextKind={context.contextKind}
        platformAdmin={context.platformAdmin}
      >
        {children}
      </AppShell>
    );
  const session = await createSupabaseServer();
  const { data, error: authError } = await session.auth.getClaims();
  const userId = data?.claims?.sub;
  if (authError || typeof userId !== "string")
    throw new Error("UNAUTHENTICATED");
  const platform = await isPlatformAdmin(userId);
  return (
    <div>
      <header
        style={{
          position: "sticky",
          top: 0,
          padding: 16,
          display: "flex",
          gap: 20,
          background: "#0f172a",
          borderBottom: "1px solid #334155",
        }}
      >
        <strong>TTTracker</strong>
        <Link href="/workspace">Workspaces</Link>
        <Link href="/account">Personal account</Link>
        {platform && <Link href="/platform-admin">Platform Admin</Link>}
      </header>
      <main style={{ padding: 24 }}>
        {personal ? (
          children
        ) : (
          <>
            <h1>Choose a workspace</h1>
            <p>
              No active organisation membership or shared project is available.
              An organisation or project invitation is required.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
