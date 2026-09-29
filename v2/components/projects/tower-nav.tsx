import Link from "next/link";

import { tt } from "@/components/ui/tt-ui";

type Props = {
  organisationId: string;
  projectId: string;
  towerId: string;
  sections: Array<{
    key: string;
    label: string;
    routeSegment: string;
  }>;
};

export default function TowerNav({
  organisationId,
  projectId,
  towerId,
  sections,
}: Props) {
  return (
    <nav
      className={tt.nav}
      aria-label="Tower sections"
    >
      {sections.map((section) => {
        const href =
          section.routeSegment
            ? `/workspace/projects/${projectId}/towers/${towerId}/${section.routeSegment}?organisation=${encodeURIComponent(
                organisationId,
              )}`
            : `/workspace/projects/${projectId}/towers/${towerId}?organisation=${encodeURIComponent(
                organisationId,
              )}`;

        return (
          <Link
            key={section.key}
            href={href}
            className={tt.navLink}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
