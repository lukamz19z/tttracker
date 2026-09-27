import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/platform/server";
import PlatformAdminClient from "./platform-admin-client";

export default async function PlatformAdminPage() {
  try {
    const admin = await requirePlatformAdmin();

    return (
      <PlatformAdminClient
        admin={{
          displayName: admin.displayName,
          email: admin.email,
          role: admin.role,
        }}
      />
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UNKNOWN_ERROR";

    if (message === "UNAUTHENTICATED") {
      redirect("/login");
    }

    throw error;
  }
}
