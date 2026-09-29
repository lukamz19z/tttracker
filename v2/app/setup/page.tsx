import { redirect } from "next/navigation";

import SetupClient from "./setup-client";
import { requireTenantSetupContext } from "@/lib/setup/context";

type Props = {
  searchParams: Promise<{
    organisation?: string;
  }>;
};

export default async function SetupPage({
  searchParams,
}: Props) {
  const query = await searchParams;

  const context =
    await requireTenantSetupContext(
      query.organisation ?? null,
    );

  if (context.status === "completed") {
    redirect(
      `/workspace?organisation=${encodeURIComponent(
        context.organisation.id,
      )}`,
    );
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
          maxWidth: 1120,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            color: "#7dd3fc",
            fontWeight: 800,
            fontSize: 14,
            marginBottom: 22,
          }}
        >
          TTTracker
        </div>

        <SetupClient
          organisationId={context.organisation.id}
          organisationName={context.organisation.name}
          initialStepKey={context.currentStepKey}
          steps={context.steps}
          completedRequired={
            context.completedRequired
          }
          totalRequired={context.totalRequired}
        />
      </div>
    </main>
  );
}
