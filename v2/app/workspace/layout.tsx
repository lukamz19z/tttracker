import AppShell from "@/components/workspace/app-shell";
import { requireWorkspaceContext } from "@/lib/workspace/context";

type Props = {
  children: React.ReactNode;
};

export default async function WorkspaceLayout({
  children,
}: Props) {
  const context =
    await requireWorkspaceContext();

  return (
    <AppShell
      organisation={context.organisation}
      memberships={context.memberships}
      sections={context.sections}
      email={context.email}
    >
      {children}
    </AppShell>
  );
}
