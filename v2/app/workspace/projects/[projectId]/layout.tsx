import ProjectShell from "@/components/projects/project-shell";
import { requireProjectContext } from "@/lib/projects/project-context";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    projectId: string;
  }>;
}) {
  const { projectId } = await params;

  const context =
    await requireProjectContext(
      projectId,
    );

  return (
    <ProjectShell
      organisationId={
        context.workspace.organisation
          .organisationId
      }
      projectId={projectId}
      projectName={context.project.name}
      projectNumber={
        context.project.project_number ??
        context.project.code
      }
      sections={context.sections}
    >
      {children}
    </ProjectShell>
  );
}
