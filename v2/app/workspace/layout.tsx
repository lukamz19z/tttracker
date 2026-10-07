import { headers } from "next/headers";
import WorkspaceFrame from "@/components/workspace/workspace-frame";

type Props = {
  children: React.ReactNode;
};

export default async function WorkspaceLayout({ children }: Props) {
  const requestHeaders = await headers();
  const organisationId = requestHeaders.get("x-tttracker-organisation-id");
  return (
    <WorkspaceFrame organisationId={organisationId}>{children}</WorkspaceFrame>
  );
}
