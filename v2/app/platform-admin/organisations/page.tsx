import { requirePlatformPage } from "@/lib/platform/server";
import PlatformAdminClient from "../platform-admin-client";
export default async function OrganisationsPage() {
  const admin = await requirePlatformPage();
  return (
    <PlatformAdminClient
      admin={{
        displayName: admin.displayName,
        email: admin.email,
        role: admin.role,
      }}
    />
  );
}
