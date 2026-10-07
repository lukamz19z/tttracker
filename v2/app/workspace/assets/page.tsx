import { requireWorkspaceSection } from "@/lib/workspace/context";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organisation?: string }>;
}) {
  const context = await requireWorkspaceSection(
    (await searchParams).organisation,
    "workspace_assets",
  );
  return (
    <div>
      <h1>Assets</h1>
      <p style={{ color: "#94a3b8" }}>
        {context.organisation.organisationName} / Organisation workspace
      </p>
      <div className="tt-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Module foundation</h2>
        <p>
          The organisation asset register will be developed here. No asset
          records are exposed by this foundation page.
        </p>
        <p style={{ color: "#94a3b8" }}>Not implemented yet.</p>
      </div>
    </div>
  );
}
