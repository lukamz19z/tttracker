"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./project-shell.module.css";

type Section = {
  key: string;
  label: string;
  routeSegment: string;
};

type Props = {
  children: React.ReactNode;
  organisationId: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  sections: Section[];
};

export default function ProjectShell({
  children,
  organisationId,
  projectId,
  projectName,
  projectNumber,
  sections,
}: Props) {
  const pathname = usePathname();

  function hrefFor(
    section: Section,
  ) {
    const query =
      `organisation=${encodeURIComponent(
        organisationId,
      )}`;

    return section.routeSegment
      ? `/workspace/projects/${projectId}/${section.routeSegment}?${query}`
      : `/workspace/projects/${projectId}?${query}`;
  }

  function isActive(
    section: Section,
  ) {
    if (!section.routeSegment) {
      return (
        pathname ===
        `/workspace/projects/${projectId}`
      );
    }

    return pathname.startsWith(
      `/workspace/projects/${projectId}/${section.routeSegment}`,
    );
  }

  return (
    <div className={styles.shell}>
      <aside
        className={styles.sidebar}
        aria-label="Project navigation"
      >
        <div className={styles.projectHeader}>
          <div className={styles.projectCode}>
            {projectNumber}
          </div>
          <div className={styles.projectName}>
            {projectName}
          </div>
        </div>

        <nav className={styles.nav}>
          {sections.map((section) => (
            <Link
              key={section.key}
              href={hrefFor(section)}
              className={`${styles.link} ${
                isActive(section)
                  ? styles.active
                  : ""
              }`}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}
