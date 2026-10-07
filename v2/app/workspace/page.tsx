import Link from "next/link";
import { ArrowRight, FolderKanban, Users, Truck, Settings } from "lucide-react";
import styles from "@/components/workspace/workspace-home.module.css";
import { requireProjectListContext } from "@/lib/projects/list-context";
import { listAccessibleProjects } from "@/lib/projects/list";
import { workspaceHref } from "@/lib/workspace/navigation";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ organisation?: string }>;
}) {
  let context;
  try {
    context = await requireProjectListContext(
      (await searchParams).organisation,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "NO_ACTIVE_ORGANISATION_MEMBERSHIP"
    )
      return null;
    throw error;
  }
  const orgId = context.organisation.organisationId;
  const canSeeProjects = context.sections.some(
    (s) => s.key === "workspace_projects",
  );
  const projects = canSeeProjects ? await listAccessibleProjects(orgId) : [];
  const shortcuts = context.projectOnly
    ? []
    : context.sections.filter((section) =>
        ["workspace_people", "workspace_assets", "workspace_settings"].includes(
          section.key,
        ),
      );
  const canCreate =
    !context.projectOnly &&
    context.enabledModules.has("projects") &&
    context.permissions?.["projects.create"];
  return (
    <div className={styles.dashboard}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            {context.projectOnly
              ? "Client workspace"
              : "Organisation workspace"}
          </p>
          <h1>{context.organisation.organisationName}</h1>
          <p>Open your accessible projects and workspace tools.</p>
        </div>
        {canCreate && (
          <Link
            className="tt-button tt-button-primary"
            href={workspaceHref(orgId, "projects/new")}
          >
            New project
          </Link>
        )}
      </header>
      <div className={styles.grid}>
        {canSeeProjects && (
          <Link className={styles.card} href={workspaceHref(orgId, "projects")}>
            <FolderKanban size={22} />
            <strong className={styles.metric}>{projects.length}</strong>
            <h2>Accessible projects</h2>
            <p>Projects available through your current workspace access.</p>
            <span>
              View projects <ArrowRight size={16} />
            </span>
          </Link>
        )}
        {shortcuts.map((section) => {
          const people = section.key === "workspace_people";
          const assets = section.key === "workspace_assets";
          const Icon = people ? Users : assets ? Truck : Settings;
          return (
            <Link
              key={section.key}
              className={styles.card}
              href={workspaceHref(orgId, section.routeSegment)}
            >
              <Icon size={22} />
              <h2>{section.label}</h2>
              <p>
                {people
                  ? "Your workforce, crews, onboarding and training workspace."
                  : assets
                    ? "Your plant, vehicles, equipment and compliance workspace."
                    : "Organisation configuration, modules and system access."}
              </p>
              <span>
                Open {section.label} <ArrowRight size={16} />
              </span>
            </Link>
          );
        })}
      </div>
      {canSeeProjects && (
        <section className={styles.register}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Your projects</h2>
              <p>
                {context.projectOnly
                  ? "Projects shared with this client workspace."
                  : "Your authorised project register."}
              </p>
            </div>
            <Link href={workspaceHref(orgId, "projects")}>
              View all projects <ArrowRight size={16} />
            </Link>
          </div>
          {projects.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Identifier</th>
                    <th>Status</th>
                    <th>Context</th>
                    <th>
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.slice(0, 10).map((project) => (
                    <tr key={project.id}>
                      <td>
                        <Link href={project.href}>{project.name}</Link>
                        {project.location && <small>{project.location}</small>}
                      </td>
                      <td>{project.project_number ?? project.code}</td>
                      <td>
                        <span className={styles.status}>
                          {project.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        {project.party
                          ? "Shared project"
                          : "Organisation project"}
                      </td>
                      <td>
                        <Link className={styles.open} href={project.href}>
                          Open <ArrowRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.empty}>
              No accessible projects in this workspace.
            </p>
          )}
          {projects.length > 10 && (
            <p className={styles.empty}>
              Showing 10 of {projects.length} accessible projects.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
